"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { MerkleTreeNode } from "@/lib/types";

/** Recursive collapsible node. Changed subtrees (and their ancestors) are highlighted in
 * accent color; unchanged subtrees render dim, visually reinforcing that the Merkle tree let
 * us skip re-diffing them entirely. */
function TreeNode({
  node,
  depth = 0,
  selectedPath,
  onSelectPage,
}: {
  node: MerkleTreeNode;
  depth?: number;
  selectedPath: string | null;
  onSelectPage: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(depth > 1 && !node.changed);
  const hasChildren = node.children.length > 0;
  const label = node.name === "/" ? "/" : node.name;
  const selected = selectedPath === node.path;

  return (
    <div className="flex flex-col">
      <motion.div
        whileHover={{ x: 2 }}
        className={`flex items-center gap-2 text-left px-2 py-1 rounded-md text-sm transition-colors ${
          selected ? "bg-accent/15" : ""
        }`}
        style={{ marginLeft: depth * 18 }}
        title={node.hash}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
            className="w-3 text-xs text-foreground-muted cursor-pointer"
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            node.changed ? "bg-accent" : "bg-border-subtle"
          }`}
        />
        {node.is_leaf ? (
          <button
            type="button"
            onClick={() => onSelectPage(node.path)}
            className={`min-w-0 truncate text-left cursor-pointer hover:underline ${
              node.changed ? "text-accent font-medium" : "text-foreground-muted"
            }`}
          >
            {label}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => hasChildren && setCollapsed((c) => !c)}
            className={`min-w-0 truncate text-left cursor-pointer ${
              node.changed
                ? "text-accent font-medium hover:underline"
                : "text-foreground-muted hover:underline"
            }`}
          >
            {label}
          </button>
        )}
        {node.is_leaf && (
          <span className="text-[10px] font-mono text-foreground-muted/60 ml-1 shrink-0">
            {node.hash.slice(0, 8)}
          </span>
        )}
      </motion.div>
      {hasChildren && !collapsed && (
        <div>
          {node.children
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectPage={onSelectPage}
              />
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
  selectedPath,
  onSelectPage,
}: {
  tree: MerkleTreeNode;
  rootHash: string;
  changedCount: number;
  selectedPath: string | null;
  onSelectPage: (path: string) => void;
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
        <TreeNode
          node={tree}
          selectedPath={selectedPath}
          onSelectPage={onSelectPage}
        />
      </motion.div>
      <p className="text-[11px] text-foreground-muted mt-2">
        Drag to pan · expand/collapse folders · select a page to view its llms.txt section ·
        highlighted nodes changed in the most recent crawl
      </p>
    </div>
  );
}
