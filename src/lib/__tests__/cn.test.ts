import { cn } from "../cn";

describe("cn", () => {
  it("joins conditional classes", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("resolves conflicting tailwind classes with the last one winning", () => {
    expect(cn("px-4 py-2 bg-primary", "bg-danger")).toBe("px-4 py-2 bg-danger");
    expect(cn("text-base text-text", "text-lg")).toBe("text-text text-lg");
  });
});
