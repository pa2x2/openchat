import { getProviderDescriptor, listProviderDescriptors, openCodeDescriptor } from "../registry";

describe("provider registry", () => {
  it("registers the OpenCode descriptor", () => {
    expect(getProviderDescriptor("opencode")).toBe(openCodeDescriptor);
    expect(getProviderDescriptor("unknown")).toBeUndefined();
    expect(listProviderDescriptors()).toEqual([openCodeDescriptor]);
  });

  it("describes the connection form fields", () => {
    const keys = openCodeDescriptor.fields.map((field) => field.key);
    expect(keys).toEqual(["baseUrl", "password"]);
    const baseUrl = openCodeDescriptor.fields[0];
    const password = openCodeDescriptor.fields[1];
    expect(baseUrl?.required).toBe(true);
    expect(password?.required).toBe(false);
    expect(password?.secure).toBe(true);
  });

  it("constructs a provider with server-driven capabilities", () => {
    const provider = openCodeDescriptor.create({ baseUrl: "http://srv" });
    expect(provider.id).toBe("opencode");
    expect(provider.capabilities).toEqual({
      reasoning: true,
      attachments: true,
      interrupt: true,
      regenerate: true,
      modelSelection: true,
      deleteChat: true,
    });
  });
});
