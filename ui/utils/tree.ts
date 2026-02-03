import type { DiffFile } from "../types";

export type TreeNode =
  | { type: "dir"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string; file: DiffFile };

export const buildTree = (files: DiffFile[]): TreeNode[] => {
  const root: TreeNode = { type: "dir", name: "", path: "", children: [] };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      const existing = current.children.find(
        (node) => node.name === part && node.type === (isFile ? "file" : "dir")
      );

      if (existing) {
        if (!isFile && existing.type === "dir") current = existing;
        return;
      }

      if (isFile) {
        current.children.push({ type: "file", name: part, path: currentPath, file });
        return;
      }

      const dirNode: TreeNode = { type: "dir", name: part, path: currentPath, children: [] };
      current.children.push(dirNode);
      current = dirNode;
    });
  }

  return sortNodes(root.children);
};

export const listDirPaths = (nodes: TreeNode[]) => {
  const paths: string[] = [];
  const walk = (items: TreeNode[]) => {
    for (const node of items) {
      if (node.type === "dir") {
        paths.push(node.path);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return paths;
};

const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((node) =>
    node.type === "dir"
      ? { ...node, children: sortNodes(node.children) }
      : node
  );
};
