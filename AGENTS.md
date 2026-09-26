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

A change does not come with tests by default. Features and fixes usually need none: typecheck, lint and trying the change on the emulator catch most mistakes. Tests written just because a change was made are how this suite once grew past half the size of the app, and most of them were deleted.

Tests live in `__tests__/*.test.ts(x)` next to the code they cover. Jest mocks for native modules are in the root `__mocks__/`.

### When to write one

Write a test only when all three hold:

1. **The bug would go unnoticed.** Typecheck and lint wouldn't catch it, and neither would using the feature once on the emulator. Think races, reconnects mid-stream, what survives an app restart, server wire formats, and error paths you can't easily trigger by hand.
2. **The bug is likely.** Either it has happened before, or the logic is subtle enough that a reasonable edit would break it. "What if someone deletes this line" doesn't count.
3. **Nothing else catches it.** No existing test, type or lint rule already covers it.

Name the bug before you write the test. "Checks that search works" is not a bug. "A star on one provider reorders another provider's models" is. If you can only describe what the code does, not how it would go wrong, don't write the test.

### How to write one

- **One test per bug, not per branch.** Don't list every event type, status code or enum value. Cover only the cases that differ from the obvious.
- **Assert related things together.** One test can check that a failed fetch keeps the cache _and_ clears the loading flag. Don't split those into separate `it`s with the same setup.
- **Test where the logic lives.** Call the function or store that owns it, not a screen that uses it.
- **No new test infrastructure.** If a test needs a new mock, fixture generator or render helper, it is probably the wrong test. Move the logic into a plain function and test that.

### Don't write these

Every one of these has been written here before and deleted.

- **Library behaviour.** Don't test that `clsx`/`tailwind-merge` merges classes, that zustand's `set` stores a value, or that `Pressable` calls `onPress`. Those libraries have their own tests.
- **Setter round-trips.** `setAppearance("dark")` followed by `expect(appearance).toBe("dark")` only restates the setter. Test store logic instead: ordering, dedupe, merging, error handling, what persists.
- **Constants and static config.** `expect(MAX_ATTACHMENT_BYTES).toBe(4 * 1024 * 1024)`, or asserting the fields of a provider descriptor or a capabilities object, just copies the source. Test the behaviour that uses the constant, such as rejecting a file over the limit.
- **Tautologies.** If the expected value is computed the same way as the implementation computes it (for example, rebuilding CSS tokens from the palette with the same map), the test can't fail. Compare against an independent source: a literal, a hand-written config file, or a real wire payload.
- **Tests of a mock.** Saving to and loading from the in-memory `expo-secure-store` mock only checks the mock. If the unit under test is a thin pass-through to a mocked module, it doesn't need a test.
- **Component render tests.** Rendering needs native-module mocks and render helpers, and it breaks on every layout change while missing what actually goes wrong on a device. If a component has logic worth testing (disabled rules, filtering, which option is selected), move it into a plain function beside the component and test that. Check the UI itself on the emulator.
- **Lint rules written as tests.** A test that scans source files for a banned pattern belongs in `eslint.config.js`, the way the raw `var(--oc-*)` ban does.
- **Duplicates.** If a mapping is covered by a unit test (`toConnectionError`), one wiring test at the next layer is enough. Don't re-test every branch there.
