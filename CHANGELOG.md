# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha01] - 2026-09-25

### ✨ Added

- First alpha build. Point the app at an OpenCode server you control, entering its URL in Settings along with the server password if you set one. The password goes to the device's secure storage, and your conversations stay on the server. Requires OpenCode 2.0.16 or newer.
- Replies stream in and render as Markdown while they arrive. Code blocks and whole replies each have a copy button.
- Model reasoning sits in a collapsible "Thought process" panel above the answer, labelled "Thinking…" while the model works.
- Stop a reply mid-sentence with the send button, which turns into a stop control, or regenerate the last reply from the message actions.
- When the connection drops mid-reply, the app reconnects and reconciles the transcript with whatever the server finished in the meantime. A stall is caught even if no data arrives at all.
- A sidebar lists the chats your server knows about, with search, a dot on chats that are still answering, and delete on long press. Deleting is also available from the chat menu.
- Set a default model for new chats in Settings, then switch models for any single chat from its title or the header menu.
- Attach photos from your library or files from the file picker, and drop them again before sending.
- Light, dark, or system appearance.

[1.0.0-alpha01]: https://github.com/pa2x2/openchat/releases/tag/v1.0.0-alpha01
