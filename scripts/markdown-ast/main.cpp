// Prints the AST react-native-nitro-markdown's native parser builds for the
// markdown on stdin, as the same JSON its Nitro binding returns (fields in a
// different order). The binding itself needs a React Native runtime; this
// links only the parser core, so Jest fixtures can come from the real parser.
// Options match src/features/markdown/parse.ts.
#include "NitroMD4CParser.hpp"
#include <cstdio>
#include <iostream>
#include <sstream>

using namespace NitroMarkdown;

static void writeString(std::ostream& out, const std::string& value) {
  out << '"';
  for (unsigned char c : value) {
    switch (c) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (c < 0x20) {
          char escaped[8];
          std::snprintf(escaped, sizeof escaped, "\\u%04x", c);
          out << escaped;
        } else {
          out << c;
        }
    }
  }
  out << '"';
}

static void writeNode(std::ostream& out, const MarkdownNode& node) {
  out << "{\"type\":";
  writeString(out, nodeTypeToString(node.type));
  out << ",\"beg\":" << node.beg << ",\"end\":" << node.end;
  if (node.content) { out << ",\"content\":"; writeString(out, *node.content); }
  if (node.level) out << ",\"level\":" << *node.level;
  if (node.href) { out << ",\"href\":"; writeString(out, *node.href); }
  if (node.title) { out << ",\"title\":"; writeString(out, *node.title); }
  if (node.alt) { out << ",\"alt\":"; writeString(out, *node.alt); }
  if (node.language) { out << ",\"language\":"; writeString(out, *node.language); }
  if (node.ordered) out << ",\"ordered\":" << (*node.ordered ? "true" : "false");
  if (node.start) out << ",\"start\":" << *node.start;
  if (node.checked) out << ",\"checked\":" << (*node.checked ? "true" : "false");
  if (node.isHeader) out << ",\"isHeader\":" << (*node.isHeader ? "true" : "false");
  if (node.align && !textAlignToString(*node.align).empty()) {
    out << ",\"align\":";
    writeString(out, textAlignToString(*node.align));
  }
  if (!node.children.empty()) {
    out << ",\"children\":[";
    for (size_t index = 0; index < node.children.size(); index++) {
      if (index > 0) out << ',';
      writeNode(out, *node.children[index]);
    }
    out << ']';
  }
  out << '}';
}

int main() {
  std::stringstream input;
  input << std::cin.rdbuf();
  ParserOptions options;
  options.gfm = true;
  options.math = false;
  options.html = false;
  MD4CParser parser;
  writeNode(std::cout, *parser.parse(input.str(), options));
  std::cout << '\n';
}
