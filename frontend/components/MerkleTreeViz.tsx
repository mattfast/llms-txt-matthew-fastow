"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { MerkleTreeNode } from "@/lib/types";

/** Recursive collapsible node. Changed subtrees (and their ancestors) are highlighted in
 * accent color; unchanged subtrees render dim, visually reinforcing that the Merkle tree let
 * us skip re-diffing them entirely. */
function TreeNode({ node, depth = 0 }: { node: MerkleTreeNode; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1 && !node.changed);
  const hasChildren = node.children.length > 0;
  const label = node.name === "/" ? "/" : node.name;

  return (
    <div className="flex flex-col">
      <motion.button
        onClick={() => hasChildren && setCollapsed((c) => !c)}
        whileHover={{ x: 2 }}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded-md text-sm transition-colors cursor-pointer ${
          node.changed
            ? "text-accent font-medium hover:bg-accent/10"
            : "text-foreground-muted hover:bg-surface-hover"
        }`}
        style={{ marginLeft: depth * 18 }}
        title={node.hash}
      >
        {hasChildren && (
          <span className="w-3 text-xs">{collapsed ? "▸" : "▾"}</span>
        )}
        {!hasChildren && <span className="w-3" />}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            node.changed ? "bg-accent" : "bg-border-subtle"
          }`}
        />
        <span className="truncate">{label}</span>
        {node.is_leaf && (
          <span className="text-[10px] font-mono text-foreground-muted/60 ml-1">
            {node.hash.slice(0, 8)}
          </span>
        )}
      </motion.button>
      {hasChildren && !collapsed && (
        <div>
          {node.children
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

export function MerkleTreeViz({
  tree,
  rootHash,
  changedCount,
}: {
  tree: MerkleTreeNode;
  rootHash: string;
  changedCount: number;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-sm">Merkle tree</h3>
          <p className="text-xs text-foreground-muted font-mono mt-0.5">
            root {rootHash.slice(0, 16)}…
          </p>
        </div>
        {changedCount > 0 ? (
          <span className="pill bg-accent/15 text-accent text-xs px-2.5 py-1">
            {changedCount} changed
          </span>
        ) : (
          <span className="pill bg-surface-hover text-foreground-muted text-xs px-2.5 py-1">
            unchanged
          </span>
        )}
      </div>
      <motion.div
        drag
        dragConstraints={{ left: -400, right: 100, top: -200, bottom: 100 }}
        dragElastic={0.05}
        className="max-h-80 overflow-auto cursor-grab active:cursor-grabbing bg-surface rounded-lg p-3 border border-border-subtle"
      >
        <TreeNode node={tree} />
      </motion.div>
      <p className="text-[11px] text-foreground-muted mt-2">
        Drag to pan · click a node to expand/collapse · highlighted nodes changed in the most
        recent crawl
      </p>
    </div>
  );
}
