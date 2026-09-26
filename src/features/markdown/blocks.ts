import type { MarkdownNode } from "./parse";

export interface KeyedBlock {
  key: string;
  node: MarkdownNode;
}

/**
 * Pairs sibling blocks with React keys. A block's source offset does not move
 * while a reply streams in after it, so finished blocks keep their identity
 * (and their state: a code block's scroll position, its "Copied" feedback)
 * as the text grows. The type is part of the key, so a block that turns into
 * another kind, such as a paragraph that becomes a table once its separator
 * row arrives, remounts.
 */
export function keyedBlocks(nodes: readonly MarkdownNode[]): KeyedBlock[] {
  const seen = new Set<string>();
  return nodes.map((node, index) => {
    let key = node.beg === undefined ? `${node.type}#${index}` : `${node.type}:${node.beg}`;
    if (seen.has(key)) key = `${key}#${index}`;
    seen.add(key);
    return { key, node };
  });
}

/** Space above a block, in px. Set per pair so nothing shifts when a block completes. */
export function blockGap(
  previous: MarkdownNode | undefined,
  current: MarkdownNode,
  compact: boolean,
): number {
  if (!previous) return 0;
  if (compact) return 4;
  if (current.type === "heading") return 20;
  if (previous.type === "heading") return 8;
  return 14;
}

const BULLETS = ["•", "◦", "▪"];

/** `depth` is 0 for a top-level list. */
export function listMarkers(list: MarkdownNode, depth: number): string[] {
  const start = list.start ?? 1;
  return (list.children ?? []).map((item, index) => {
    if (item.type === "task_list_item") return item.checked ? "☑" : "☐";
    if (list.ordered) return `${start + index}.`;
    return BULLETS[depth % BULLETS.length];
  });
}

function isInline(node: MarkdownNode): boolean {
  switch (node.type) {
    case "text":
    case "bold":
    case "italic":
    case "strikethrough":
    case "link":
    case "image":
    case "code_inline":
    case "math_inline":
    case "html_inline":
    case "soft_break":
    case "line_break":
      return true;
    default:
      return false;
  }
}

/**
 * The blocks inside a list item. In a tight list the parser puts the item's
 * text straight into the item, beside any nested list; this wraps each run of
 * inline nodes in a paragraph so the item renders like any other block list.
 */
export function listItemBlocks(item: MarkdownNode): MarkdownNode[] {
  const blocks: MarkdownNode[] = [];
  let inline: MarkdownNode[] = [];
  const flush = () => {
    if (inline.length === 0) return;
    blocks.push({ type: "paragraph", beg: inline[0].beg, children: inline });
    inline = [];
  };
  for (const child of item.children ?? []) {
    if (isInline(child)) {
      inline.push(child);
    } else {
      flush();
      blocks.push(child);
    }
  }
  flush();
  return blocks;
}

export function nodeText(node: MarkdownNode): string {
  if (node.content !== undefined) return node.content;
  return (node.children ?? []).map(nodeText).join("");
}

export function tableRows(table: MarkdownNode): MarkdownNode[] {
  const rows: MarkdownNode[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === "table_row") rows.push(node);
    else node.children?.forEach(visit);
  };
  visit(table);
  return rows;
}

/** Structural equality, so a block whose source did not change skips rendering. */
export function sameNode(a: MarkdownNode, b: MarkdownNode): boolean {
  if (a === b) return true;
  if (
    a.type !== b.type ||
    a.content !== b.content ||
    a.beg !== b.beg ||
    a.level !== b.level ||
    a.href !== b.href ||
    a.alt !== b.alt ||
    a.language !== b.language ||
    a.ordered !== b.ordered ||
    a.start !== b.start ||
    a.checked !== b.checked ||
    a.isHeader !== b.isHeader ||
    a.align !== b.align
  ) {
    return false;
  }
  const left = a.children ?? [];
  const right = b.children ?? [];
  if (left.length !== right.length) return false;
  return left.every((child, index) => sameNode(child, right[index]));
}
