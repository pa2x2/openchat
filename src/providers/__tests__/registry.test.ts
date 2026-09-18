import { getProviderDescriptor, listProviderDescriptors, openCodeDescriptor } from "../registry";

describe("provider registry", () => {
  it("registers the OpenCode descriptor", () => {
    expect(getProviderDescriptor("opencode")).toBe(openCodeDescriptor);
    expect(getProviderDescriptor("unknown")).toBeUndefined();
    expect(listProviderDescriptors()).toEqual([openCodeDescriptor]);
  });

  it("describes the connection form fields", () => {
    const keys = openCodeDescriptor.fields.map((field) => field.key);
    expect(keys).toEqual(["baseUrl"]);
    expect(openCodeDescriptor.fields[0]?.required).toBe(true);
  });

  it("constructs a provider with server-driven capabilities", () => {
    const provider = openCodeDescriptor.create({ baseUrl: "http://srv" });
    expect(provider.id).toBe("opencode");
    expect(provider.capabilities).toEqual({
      reasoning: true,
      attachments: true,
      interrupt: true,
      regenerate: false,
      modelSelection: true,
      deleteChat: true,
    });
  });
});
