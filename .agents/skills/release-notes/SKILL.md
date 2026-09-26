---
name: release-notes
description: Generate OpenChat app release notes in CHANGELOG.md. Use when asked to run or prepare an OpenChat release changelog.
---

## Inspect the release

1. Read `version` from `package.json` as the release version. Require a semantic version
   such as `1.1.0` or a prerelease such as `1.1.0-alpha02` (the same format the
   `release-android` workflow accepts) and derive future tag `v<version>`; stop if the
   version is missing or invalid.
2. Compare `HEAD` with the most recent release tag, found with
   `git describe --tags --abbrev=0 --match 'v*'`. Inspect `git log <tag>..HEAD` and
   `git diff <tag>...HEAD`. With no earlier release tag, use the full history.
3. Read `CHANGELOG.md`. If it does not exist, create it with a `# Changelog` heading. If it
   already has a section for the configured version, revise that section instead of adding
   a second one.

## Changelog writing rules

1. Verify final behavior in the relevant source and tests before claiming an outcome.
   Trace representative runtime and presentation paths (`app/`, `src/features/`,
   `src/ui/`, `src/providers/`) for user-facing outcomes.
2. Build a shortlist of release-note candidates by user-facing outcome, not by commit.
   Combine related commits into one outcome and discard duplicate, superseded, reverted,
   or implementation-only work. A large commit range may legitimately produce only a few
   bullets.
   Classify each outcome by its final behavior rather than the commit subject. Omit
   follow-up fixes that merely complete, correct, or safeguard the expected behavior of a
   feature introduced in the same release range; they are not separate release-note outcomes.
3. The audience is people who install the app and connect it to their own server. Call out
   changes that require action on their side, such as a new minimum OpenCode server version
   (the `@opencode/client` version in `package.json`), a new required server setting, or
   stored data that is reset.
4. Omit by default:
   - documentation, comments, translations, formatting, lint, and typo-only changes;
   - test additions, test fixes, fixtures, mocks, and test infrastructure;
   - refactors, renames, code cleanup, dependency updates, build/CI/release plumbing,
     config plugins, and developer tooling;
   - internal APIs, store and domain model changes, and implementation details with no
     verified effect on users;
   - changes under `docker/`, which ship separately as `server-opencode-*` image releases;
   - intermediate fixes whose final released behavior is unchanged, and fixes for bugs
     introduced and corrected entirely within the same release range.
5. Use a Keep a Changelog-compatible section named `[X.Y.Z]` (or `[X.Y.Z-prerelease]`) with
   the current date for a numbered release, or an undated `[Unreleased]` section for
   pending changes. Use only the applicable decorated category headings from this mapping:

   - `✨ Added` - for new features.
   - `🔄 Changed` - for changes in existing functionality.
   - `🧩 Improved` - for enhancement in existing functionality.
   - `🗑️ Removed` - for now removed features.
   - `🐛 Fixed` - for any bug fixes.
   - `🧩 Other` - for technical stuff.
   - `⚡️ Performance` - for optimizations in existing functionality.

   Use this shape:

   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   ### ✨ Added

   - A distinct outcome for users.
   ```

   For the first release, summarize what the app can do as a short `✨ Added` list of
   capabilities rather than listing every commit.

6. Use `unslop` skill to write notes. If it is unavailable, describe outcomes in concise,
   natural, polished language. Let each heading provide the category context. Keep the tone
   factual rather than promotional, and make each bullet understandable without commit or
   implementation context.
7. Preserve released entries and avoid repeating documented outcomes. Keep `[Unreleased]`
   first and numbered releases in descending version order. When preparing a release,
   move its applicable unreleased notes into the release section. If there are no new
   outcomes, leave the file unchanged and report that it was reviewed; do not create
   empty sections.

## Update CHANGELOG.md

1. Update `CHANGELOG.md` using the writing rules above.
2. Maintain link definitions at the end of the file, using the repository URL from
   `git remote get-url origin` (for example `https://github.com/pa2x2/openchat`):

   ```markdown
   [Unreleased]: https://github.com/pa2x2/openchat/compare/vX.Y.Z...HEAD
   [X.Y.Z]: https://github.com/pa2x2/openchat/releases/tag/vX.Y.Z
   ```

   Point `[Unreleased]` at the newest version tag and add a link for each numbered section.
   Omit the `[Unreleased]` link when there is no `[Unreleased]` section.

3. The `release-android` workflow creates a draft GitHub release with a placeholder body.
   After updating the file, print the new release section so it can be pasted into that
   draft.

## Guidance

- Derive release-note content exclusively from the chosen git range. A future `vX.Y.Z` tag
  is a release identifier for changelog links, not a required comparison endpoint.
- Do not bump `version` or `versionCode`, create tags, or commit; only edit `CHANGELOG.md`.
- Create a temporary file to track your findings and take notes during exploration.
