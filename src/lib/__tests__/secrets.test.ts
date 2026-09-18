import { clearPassword, loadPassword, savePassword } from "../secrets";

describe("secrets", () => {
  it("persists, loads and clears the password per provider", async () => {
    await expect(loadPassword("opencode")).resolves.toBeUndefined();
    await savePassword("opencode", "s3cret!");
    await expect(loadPassword("opencode")).resolves.toBe("s3cret!");
    // namespaced per provider
    await expect(loadPassword("other")).resolves.toBeUndefined();
    await clearPassword("opencode");
    await expect(loadPassword("opencode")).resolves.toBeUndefined();
  });
});
