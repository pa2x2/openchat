# AGENTS.md

## Checks

Run all three before you call a change done. The release workflow fails on any of them.

```sh
pnpm typecheck
pnpm lint
pnpm test
```

## Comments

A comment earns its place by telling the reader something the code can't: why it's done this way, a constraint or platform quirk it works around, a bug it prevents, or what a non-obvious value means. If deleting the comment loses nothing a careful reader couldn't get from the code, delete it.

- **Don't restate the code.** No `/** Stops a running download. */` over `cancelDownload`, no `// Re-fetch on foreground` over an `AppState` listener, no `/** Last failure, as a user-facing message. */` over `error: string | null`.
- **Don't narrate names or types.** If a field, prop or function name plus its type already says it, leave it bare. Document a field only when its meaning isn't obvious: units, what `null`/`undefined` stands for, who sets it, what it must never be.
- **Don't write file headers that only name the file.** "Tests for the chats store" or "Model listing against the API" add nothing. A header is worth it when it explains a design: how the parts fit, what the module owns, a contract callers rely on.
- **Keep comments true.** When you change code, update or delete the comments it touches. A stale comment is worse than none.

## Writing tests

A test earns its place by failing when the app breaks in a way a user or a caller would notice. Before you write one, name the bug it catches. If you can't, don't write it.

Tests live in `__tests__/*.test.ts(x)` next to the code they cover. Jest mocks for native modules are in the root `__mocks__/`.

### Don't write these

Every one of these has been written here before and deleted.

- **Library behaviour.** Don't test that `clsx`/`tailwind-merge` merges classes, that zustand's `set` stores a value, or that `Pressable` calls `onPress`. Those libraries have their own tests.
- **Setter round-trips.** `setAppearance("dark")` followed by `expect(appearance).toBe("dark")` only restates the setter. Test store logic instead: ordering, dedupe, merging, error handling, what persists.
- **Constants and static config.** `expect(MAX_ATTACHMENT_BYTES).toBe(4 * 1024 * 1024)`, or asserting the fields of a provider descriptor or a capabilities object, just copies the source. Test the behaviour that uses the constant, such as rejecting a file over the limit.
- **Tautologies.** If the expected value is computed the same way as the implementation computes it (for example, rebuilding CSS tokens from the palette with the same map), the test can't fail. Compare against an independent source: a literal, a hand-written config file, or a real wire payload.
- **Tests of a mock.** Saving to and loading from the in-memory `expo-secure-store` mock only checks the mock. If the unit under test is a thin pass-through to a mocked module, it doesn't need a test.
- **Smoke renders and prop pass-through.** "Renders its label" and "forwards `onChangeText`" don't catch real bugs. Test a component when it has logic: conditional UI, disabled rules, state changes, accessibility state.
- **Duplicates.** If a mapping is covered by a unit test (`toConnectionError`), one wiring test at the next layer is enough. Don't re-test every branch there.
