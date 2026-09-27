"""Merkle tree for cheap, localized website-change detection.

A site's pages are organized into a tree by URL path (e.g. /docs/guides/setup mounts under
/docs/guides under /docs under the root). Every page is a leaf; its hash is derived from
canonicalized page content. Every internal node's hash is derived from the sorted hashes of
its children. This gives us two properties that make recurring monitoring cheap:

1. Root hash comparison: if the root hash hasn't changed since the last crawl, we know with
   certainty that *nothing* on the site changed, without re-fetching a single page.
2. Localized diffing: if the root hash *did* change, we only need to walk into the subtrees
   whose hash differs to find out exactly which pages changed - we don't need to re-diff the
   entire site. On a 5,000-page site where 3 pages changed, this turns an O(n) content diff
   into an O(changed subtree size) operation.

This mirrors how Git, IPFS, and Cassandra's anti-entropy repair use Merkle trees to avoid
comparing entire datasets when only a small part has changed.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field


def hash_content(text: str) -> str:
    """Hashes canonicalized page content. Canonicalization strips volatile noise (whitespace
    runs, common timestamp/nonce/session-id patterns) so unrelated re-renders don't produce
    false-positive "changed" signals."""
    normalized = _canonicalize(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


_VOLATILE_PATTERNS = [
    re.compile(r"csrf[-_]?token[\"']?\s*[:=]\s*[\"']?[\w-]+", re.IGNORECASE),
    re.compile(r"nonce[\"']?\s*[:=]\s*[\"']?[\w-]+", re.IGNORECASE),
    re.compile(r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?\b"),  # ISO timestamps
    re.compile(r"\bsession[-_]?id[\"']?\s*[:=]\s*[\"']?[\w-]+", re.IGNORECASE),
]


def _canonicalize(text: str) -> str:
    cleaned = text
    for pattern in _VOLATILE_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return cleaned


def _hash_children(child_hashes: list[str]) -> str:
    joined = "".join(sorted(child_hashes))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


@dataclass
class MerkleNode:
    name: str
    full_path: str
    hash: str = ""
    is_leaf: bool = False
    children: dict[str, "MerkleNode"] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "path": self.full_path,
            "hash": self.hash,
            "is_leaf": self.is_leaf,
            "children": [c.to_dict() for c in self.children.values()],
        }


class MerkleTree:
    """Builds a Merkle tree from a flat mapping of {url_path: leaf_content_hash}."""

    def __init__(self, leaf_hashes: dict[str, str]):
        self.root = MerkleNode(name="/", full_path="/")
        for path, leaf_hash in leaf_hashes.items():
            self._insert(path, leaf_hash)
        self._compute_hashes(self.root)

    def _insert(self, path: str, leaf_hash: str) -> None:
        segments = [seg for seg in path.split("/") if seg]
        node = self.root
        accumulated = ""
        for seg in segments:
            accumulated += f"/{seg}"
            node = node.children.setdefault(seg, MerkleNode(name=seg, full_path=accumulated))
        node.is_leaf = True
        node.hash = leaf_hash

    def _compute_hashes(self, node: MerkleNode) -> str:
        if node.is_leaf and not node.children:
            return node.hash
        child_hashes = [self._compute_hashes(child) for child in node.children.values()]
        if node.is_leaf:
            child_hashes.append(node.hash)
        node.hash = _hash_children(child_hashes) if child_hashes else hash_content("")
        return node.hash

    @property
    def root_hash(self) -> str:
        return self.root.hash

    def changed_leaf_paths(self, other: "MerkleTree") -> set[str]:
        """Returns the set of leaf paths that differ between this tree and `other`, only
        recursing into subtrees whose hash actually changed."""
        changed: set[str] = set()
        self._diff_nodes(self.root, other.root, changed)
        return changed

    def _diff_nodes(self, a: MerkleNode | None, b: MerkleNode | None, changed: set[str]) -> None:
        a_hash = a.hash if a else None
        b_hash = b.hash if b else None
        if a_hash == b_hash:
            return  # subtree identical - stop recursing, this is the whole point of the tree

        if a and a.is_leaf and not a.children:
            changed.add(a.full_path)
        if b and b.is_leaf and not b.children and (not a or a.full_path != b.full_path):
            changed.add(b.full_path)

        all_keys = set((a.children if a else {}).keys()) | set((b.children if b else {}).keys())
        for key in all_keys:
            child_a = a.children.get(key) if a else None
            child_b = b.children.get(key) if b else None
            self._diff_nodes(child_a, child_b, changed)
