# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha03] - 2026-09-26

### ✨ Added

- Temporary chats. Flip the switch on the new chat screen to start one. It stays out of the sidebar and the app deletes it when you leave. It appears only where the server allows deleting chats.
- Answer questions from the server without leaving the chat. When a run pauses to ask something, a card appears above the composer with text, number, yes or no, choice and multi-select fields plus links. Submit stays disabled until the answers check out, and Dismiss skips it.
- Take a photo to attach from the attachment sheet, and tap any image thumbnail to see it full screen. Tap again or press back to close it.
- Copy a finished reply again with the copy button under it. It shows a check mark for a moment after copying. Code blocks keep their own copy button.

### 🔄 Changed

- Settings no longer has a default model. New chats start with whatever model you picked last, for each provider. Your old default carries over as that starting point.
- The composer is now a two-row card with the field on top and attach, reasoning and send below. The keyboard drops after you send. Sheets sit above the keyboard, drag down to dismiss, and closing one drops the keyboard too.
- Delete confirmation and delete errors now use a themed in-app dialog that matches light and dark mode.

### 🧩 Improved

- The model picker is now a small browser. Pick a provider from the rail on the left or open Favorites, star models to keep them there, search across every provider at once, and it opens on the model you already use. Context sizes still show under each name.
- Streaming replies render as formatted markdown while they arrive. There is no plain text tail, so nothing shifts when the reply finishes.

### 🐛 Fixed

- A message that fails to send puts your text back in the composer instead of losing it.
- Reading older messages while a reply streams no longer drags the list. Stay at the bottom and it still follows the reply.
- A sideways swipe inside a long code block now scrolls the code instead of opening the sidebar. Attachment rows behave the same way.
- A chat that the server fails to delete stays in the sidebar with an error instead of vanishing.
- Launching with light or dark forced no longer flashes the first frame in the system theme. On Android the navigation bar icons follow the app theme and the bar blends with the screen.

### ⚡️ Performance

- Streaming writes the transcript once per frame, saves it at most once a second, and re-renders only the message list. Long replies stay smooth.

## [1.0.0-alpha02] - 2026-09-26

### ✨ Added

- The app updates itself on Android
- Reasoning level, for models that offer one.
- Material You colours.

### 🧩 Improved

- The model picker shows each model's context size under its name, e.g. "200K context", so you can tell a small model from a large one before switching.

### 🔄 Changed

- Swipe right from anywhere on a chat to open the sidebar. Before, only the left fifth of the screen did it. Sideways swipes inside a code block or table still scroll that block, and a swipe that starts out vertical still scrolls the chat.

### 🗑️ Removed

- Copy reply and share reply are no longer under a finished message. Code blocks keep their copy button, and regenerate a reply is where it was.
- The suggestion chips that sat above the composer in an empty chat are gone.

### 🐛 Fixed

- The composer sat under the keyboard when a chat opened with the keyboard already up, which happened when you sent the first message from the new chat screen or started a new chat while typing. The field now takes the focus and stays visible.
- Rows and cards inside sheets, menus and the composer blended into the panel behind them in dark mode. They now sit one step lighter than their surroundings, and quotes, inline code and table headers in the update notes follow the card they are on.

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

[1.0.0-alpha03]: https://github.com/pa2x2/openchat/releases/tag/v1.0.0-alpha03
[1.0.0-alpha02]: https://github.com/pa2x2/openchat/releases/tag/v1.0.0-alpha02
[1.0.0-alpha01]: https://github.com/pa2x2/openchat/releases/tag/v1.0.0-alpha01
