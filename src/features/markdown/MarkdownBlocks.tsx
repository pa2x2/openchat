/**
 * Renders parsed markdown blocks. Each block is its own memoized component,
 * keyed by its source offset (see `keyedBlocks`), so while a reply streams
 * only the block that is still growing renders again; finished blocks keep
 * their native views and state.
 */

import {
  Fragment,
  memo,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Linking, View, type LayoutChangeEvent, type TextStyle } from "react-native";
import { Text } from "@/src/ui/Text";
// RNGH's ScrollView claims a sideways swipe before the drawer's pan can, so a
// wide table scrolls instead of the sidebar opening.
import { ScrollView } from "react-native-gesture-handler";
import {
  blockGap,
  keyedBlocks,
  listItemBlocks,
  listMarkers,
  nodeText,
  sameNode,
  tableRows,
} from "./blocks";
import { CodeBlock } from "./CodeBlock";
import type { MarkdownNode } from "./parse";
import { HighlightScope } from "./quoting";
import { MONOSPACE, type MarkdownTheme } from "./styles";

function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

function openLink(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

/** The words to light up in a paragraph, and how far into its text rendering has got. */
interface Mark {
  start: number;
  end: number;
  at: number;
}

/** A paragraph's text as its `Text` shows it, which is what a selection in it picks from. */
function inlineText(nodes: readonly MarkdownNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "html_inline":
        case "math_inline":
        case "code_inline":
          return node.content ?? "";
        case "soft_break":
        case "line_break":
          return "\n";
        case "image":
          return node.alt ?? "";
        default:
          return inlineText(node.children ?? []);
      }
    })
    .join("");
}

function marked(content: string, mark: Mark | null, theme: MarkdownTheme, key: number): ReactNode {
  if (!mark) return content;
  const from = mark.at;
  mark.at += content.length;
  const start = Math.max(mark.start, from) - from;
  const end = Math.min(mark.end, mark.at) - from;
  if (start >= end) return content;
  return (
    <Fragment key={key}>
      {content.slice(0, start)}
      <Text style={{ backgroundColor: theme.highlight }}>{content.slice(start, end)}</Text>
      {content.slice(end)}
    </Fragment>
  );
}

function renderInline(
  nodes: readonly MarkdownNode[],
  theme: MarkdownTheme,
  mark: Mark | null = null,
): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
      case "html_inline":
      case "math_inline":
        return marked(node.content ?? "", mark, theme, index);
      case "soft_break":
      case "line_break":
        if (mark) mark.at += 1;
        return "\n";
      case "bold":
        return (
          <Text key={index} style={{ fontWeight: "700" }}>
            {renderInline(node.children ?? [], theme, mark)}
          </Text>
        );
      case "italic":
        return (
          <Text key={index} style={{ fontStyle: "italic" }}>
            {renderInline(node.children ?? [], theme, mark)}
          </Text>
        );
      case "strikethrough":
        return (
          <Text key={index} style={{ color: theme.muted, textDecorationLine: "line-through" }}>
            {renderInline(node.children ?? [], theme, mark)}
          </Text>
        );
      case "code_inline":
        return (
          <Text
            key={index}
            style={{
              fontFamily: MONOSPACE,
              fontSize: 14,
              backgroundColor: theme.inlineCodeBackground,
            }}
          >
            {marked(node.content ?? "", mark, theme, 0)}
          </Text>
        );
      case "link": {
        const href = node.href ?? "";
        const children = renderInline(node.children ?? [], theme, mark);
        if (!isSafeLink(href)) return <Text key={index}>{children}</Text>;
        return (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={() => openLink(href)}
            style={{ color: theme.link, textDecorationLine: "underline" }}
          >
            {children}
          </Text>
        );
      }
      case "image":
        if (mark) mark.at += node.alt?.length ?? 0;
        // Remote images are never fetched; the alt text stands in.
        return node.alt ? (
          <Text key={index} style={{ color: theme.muted }}>
            {node.alt}
          </Text>
        ) : null;
      default:
        return <Text key={index}>{renderInline(node.children ?? [], theme, mark)}</Text>;
    }
  });
}

function Paragraph({
  node,
  theme,
  style,
}: {
  node: MarkdownNode;
  theme: MarkdownTheme;
  style?: TextStyle;
}) {
  const highlight = use(HighlightScope);
  const children = node.children ?? [];
  const start = highlight ? inlineText(children).indexOf(highlight.text) : -1;
  const lit = start >= 0 && highlight !== null;
  const shown = useRef<View>(null);
  const onShown = lit ? highlight.onShown : undefined;
  useEffect(() => {
    if (onShown && shown.current) onShown(shown.current);
  }, [onShown]);

  const text = (
    <Text selectable={theme.selectable} style={[theme.body, style]}>
      {renderInline(
        children,
        theme,
        lit ? { start, end: start + highlight.text.length, at: 0 } : null,
      )}
    </Text>
  );
  // Text can't be measured on its own; the view is there to say where it is.
  return lit ? (
    <View ref={shown} collapsable={false}>
      {text}
    </View>
  ) : (
    text
  );
}

function List({ node, theme, live, depth }: BlockProps) {
  const markers = listMarkers(node, depth);
  const markerWidth = node.ordered
    ? 10 + Math.max(...markers.map((marker) => marker.length)) * 9
    : 20;
  const items = keyedBlocks(node.children ?? []);
  return (
    <View>
      {items.map(({ key, node: item }, index) => (
        <View key={key} style={{ flexDirection: "row", marginTop: index > 0 ? 4 : 0 }}>
          <Text
            style={[
              theme.body,
              {
                width: markerWidth,
                color: theme.muted,
                textAlign: node.ordered ? "right" : "left",
              },
              node.ordered ? { paddingRight: 6 } : null,
            ]}
          >
            {markers[index]}
          </Text>
          <View style={{ flex: 1 }}>
            <MarkdownBlocks
              nodes={listItemBlocks(item)}
              theme={theme}
              live={live && index === items.length - 1}
              depth={depth + 1}
              compact
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const CELL_PADDING = 8;
// Past this a cell's text wraps rather than widening its column further.
const MAX_CELL_TEXT_WIDTH = 240;

const CELL_ALIGN = { left: "flex-start", center: "center", right: "flex-end" } as const;

function Table({ node, theme }: { node: MarkdownNode; theme: MarkdownTheme }) {
  const rows = tableRows(node);
  // Each column is as wide as its widest cell's text. Flex can't line up a
  // column across separate rows by content, so every cell's text reports its
  // natural width and the column takes the largest. Text only grows while a
  // reply streams, so a column never needs to shrink.
  const [widths, setWidths] = useState<number[]>([]);
  const measure = useCallback((column: number, event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setWidths((previous) => {
      if ((previous[column] ?? 0) >= width) return previous;
      const next = [...previous];
      next[column] = width;
      return next;
    });
  }, []);

  return (
    <View
      style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" }}
    >
      {/* A table narrower than the screen still fills it: every column grows
          by the same amount in every row. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View style={{ flexGrow: 1 }}>
          {rows.map((row, rowIndex) => {
            const cells = row.children ?? [];
            const header = cells.some((cell) => cell.isHeader);
            return (
              <View
                key={rowIndex}
                style={{
                  flexDirection: "row",
                  backgroundColor: header ? theme.panel : undefined,
                  borderTopColor: theme.border,
                  borderTopWidth: rowIndex > 0 ? 1 : 0,
                }}
              >
                {cells.map((cell, cellIndex) => (
                  <View
                    key={cellIndex}
                    style={{
                      minWidth:
                        widths[cellIndex] === undefined
                          ? undefined
                          : widths[cellIndex] + CELL_PADDING * 2,
                      flexGrow: 1,
                      padding: CELL_PADDING,
                    }}
                  >
                    {/* Hugs the text, so it measures the text and not the
                        column it has been stretched to. */}
                    <View
                      onLayout={(event) => measure(cellIndex, event)}
                      style={{
                        alignSelf: CELL_ALIGN[cell.align ?? "left"],
                        maxWidth: MAX_CELL_TEXT_WIDTH,
                      }}
                    >
                      <Paragraph
                        node={cell}
                        theme={theme}
                        style={{
                          fontWeight: cell.isHeader ? "700" : undefined,
                          textAlign: cell.align,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

interface BlockProps {
  node: MarkdownNode;
  theme: MarkdownTheme;
  /** The reply is still streaming and this block is its end. */
  live: boolean;
  /** List nesting: 0 outside any list. */
  depth: number;
}

const Block = memo(
  function Block({ node, theme, live, depth }: BlockProps) {
    switch (node.type) {
      case "heading":
        return (
          <Paragraph node={node} theme={theme} style={theme.headings[(node.level ?? 1) - 1]} />
        );
      case "list":
        return <List node={node} theme={theme} live={live} depth={depth} />;
      case "code_block":
        return (
          <CodeBlock
            code={nodeText(node).replace(/\n$/, "")}
            language={node.language || undefined}
            theme={theme}
            live={live}
          />
        );
      case "blockquote":
        return (
          <View
            style={{
              backgroundColor: theme.panel,
              borderLeftColor: theme.border,
              borderLeftWidth: 3,
              borderRadius: 4,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <MarkdownBlocks nodes={node.children ?? []} theme={theme} live={live} depth={depth} />
          </View>
        );
      case "table":
        return <Table node={node} theme={theme} />;
      case "horizontal_rule":
        return <View style={{ height: 1, marginVertical: 6, backgroundColor: theme.border }} />;
      case "html_block":
      case "math_block":
        return (
          <Text selectable={theme.selectable} style={theme.body}>
            {nodeText(node).replace(/\n$/, "")}
          </Text>
        );
      default:
        return <Paragraph node={node} theme={theme} />;
    }
  },
  (previous, next) =>
    previous.theme === next.theme &&
    previous.live === next.live &&
    previous.depth === next.depth &&
    sameNode(previous.node, next.node),
);

export interface MarkdownBlocksProps {
  nodes: readonly MarkdownNode[];
  theme: MarkdownTheme;
  /** The reply is still streaming; only the last block can still change. */
  live: boolean;
  depth?: number;
  /** Tight spacing, for the blocks inside a list item. */
  compact?: boolean;
}

export function MarkdownBlocks({
  nodes,
  theme,
  live,
  depth = 0,
  compact = false,
}: MarkdownBlocksProps) {
  return keyedBlocks(nodes).map(({ key, node }, index) => {
    const gap = blockGap(nodes[index - 1], node, compact);
    return (
      <View key={key} style={gap ? { marginTop: gap } : undefined}>
        <Block node={node} theme={theme} live={live && index === nodes.length - 1} depth={depth} />
      </View>
    );
  });
}
