/**
 * Renders parsed markdown blocks. Each block is its own memoized component,
 * keyed by its source offset (see `keyedBlocks`), so while a reply streams
 * only the block that is still growing renders again; finished blocks keep
 * their native views and state.
 */

import { memo, type ReactNode } from "react";
import { Linking, Text, View, type TextStyle } from "react-native";
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
import { MONOSPACE, type MarkdownTheme } from "./styles";

function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

function openLink(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

function renderInline(nodes: readonly MarkdownNode[], theme: MarkdownTheme): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
      case "html_inline":
      case "math_inline":
        return node.content ?? "";
      case "soft_break":
      case "line_break":
        return "\n";
      case "bold":
        return (
          <Text key={index} style={{ fontWeight: "700" }}>
            {renderInline(node.children ?? [], theme)}
          </Text>
        );
      case "italic":
        return (
          <Text key={index} style={{ fontStyle: "italic" }}>
            {renderInline(node.children ?? [], theme)}
          </Text>
        );
      case "strikethrough":
        return (
          <Text key={index} style={{ color: theme.muted, textDecorationLine: "line-through" }}>
            {renderInline(node.children ?? [], theme)}
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
            {node.content}
          </Text>
        );
      case "link": {
        const href = node.href ?? "";
        const children = renderInline(node.children ?? [], theme);
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
        // Remote images are never fetched; the alt text stands in.
        return node.alt ? (
          <Text key={index} style={{ color: theme.muted }}>
            {node.alt}
          </Text>
        ) : null;
      default:
        return <Text key={index}>{renderInline(node.children ?? [], theme)}</Text>;
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
  return (
    <Text selectable style={[theme.body, style]}>
      {renderInline(node.children ?? [], theme)}
    </Text>
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

function Table({ node, theme }: { node: MarkdownNode; theme: MarkdownTheme }) {
  const rows = tableRows(node);
  return (
    <View
      style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 12, overflow: "hidden" }}
    >
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
              <View key={cellIndex} style={{ flex: 1, padding: 8 }}>
                <Paragraph
                  node={cell}
                  theme={theme}
                  style={{
                    fontWeight: cell.isHeader ? "700" : undefined,
                    textAlign: cell.align,
                  }}
                />
              </View>
            ))}
          </View>
        );
      })}
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
          <Text selectable style={theme.body}>
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
