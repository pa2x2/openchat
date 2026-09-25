import { projectMarkdown } from "../streamProjection";

describe("projectMarkdown", () => {
  it("keeps a live paragraph tail lossless", () => {
    const text = "First paragraph.\n\nSecond paragraph is still arriving";
    const projection = projectMarkdown(text, true);

    expect(projection).toEqual({
      stable: "First paragraph.\n\n",
      tail: "Second paragraph is still arriving",
    });
    expect(projection.stable + projection.tail).toBe(text);
  });

  it("does not commit blank lines inside an open fence", () => {
    const text = "Before\n\n```ts\nconst value = 1;\n\nconst next = 2;\n```\n\nAfter";
    const projection = projectMarkdown(text, true);

    expect(projection.stable).toBe("Before\n\n```ts\nconst value = 1;\n\nconst next = 2;\n```\n\n");
    expect(projection.tail).toBe("After");
  });

  it("holds an unclosed fence until the stream is terminal", () => {
    const text = "```typescript\nconst value = 1;";
    const projection = projectMarkdown(text, true);

    expect(projection.stable).toBe("");
    expect(projection.tail).toBe(text);
    expect(projectMarkdown(text, false)).toEqual({ stable: text, tail: "" });
  });

  it("recognizes tilde fences and requires a matching fence length", () => {
    const text = "~~~\ncode\n~~~\n\nnext";
    const projection = projectMarkdown(text, true);

    expect(projection.stable).toBe("~~~\ncode\n~~~\n\n");
    expect(projection.tail).toBe("next");
    expect(projectMarkdown("````\ncode\n```\n\n", true).stable).toBe("");
  });

  it("holds a table until the following blank line", () => {
    const text = "| Name | Value |\n| --- | --- |\n| one | 1 |\n\nNext block";
    const projection = projectMarkdown(text, true);

    expect(projection.stable).toBe("| Name | Value |\n| --- | --- |\n| one | 1 |\n\n");
    expect(projection.tail).toBe("Next block");
  });

  it("preserves CRLF input while finding boundaries", () => {
    const text = "First\r\n\r\nSecond";
    const projection = projectMarkdown(text, true);

    expect(projection.stable).toBe("First\r\n\r\n");
    expect(projection.tail).toBe("Second");
    expect(projection.stable + projection.tail).toBe(text);
  });
});
