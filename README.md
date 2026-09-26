<div align="center">

<img src="./assets/images/icon.png" alt="OpenChat logo" width="104" />

# OpenChat

### A ChatGPT-style app for the AI server you run yourself.

Chat with models on your own backend from an Android app that feels like the one you already know.

[Download](https://github.com/pa2x2/openchat/releases)

[![Latest release](https://img.shields.io/github/v/release/pa2x2/openchat?include_prereleases&filter=v*&display_name=tag&sort=semver&label=release)](https://github.com/pa2x2/openchat/releases)
![Android 7+](https://img.shields.io/badge/Android-7%2B-3DDC84?logo=android&logoColor=white)
[![License](https://img.shields.io/github/license/pa2x2/openchat)](./LICENSE)

</div>

OpenChat doesn't come with a backend. You point it at a server you control, and your chats live there.

Today it talks to [OpenCode](https://opencode.ai) servers. The app keeps each backend behind its own adapter, so more can follow.

## What you get

**Answers as they stream in.** Replies render as Markdown while they arrive. Code blocks have a copy button, and the model's reasoning sits in a drawer you can open or ignore.

**Stop, retry, pick up where you left off.** Interrupt a reply mid-sentence or regenerate it. If the connection drops, the app reconnects and catches up with whatever the server finished in the meantime.

**Your models, your choice.** Set a default model, then switch it for any single chat.

**Photos and files.** Attach them from the camera roll or the file picker. Images go straight to the model. Other files reach the model only if your server's agent can read files.

## Getting started

1. Install the APK from the [releases page](https://github.com/pa2x2/openchat/releases). If you're not sure which one to pick, take `openchat-<version>.apk`.
2. Run an OpenCode server. The quickest route is the prebuilt Docker image, which ships with a chat agent that has coding tools turned off:

   ```sh
   docker run -d --name openchat-opencode \
     -p 4096:4096 \
     -e OPENCODE_SERVER_PASSWORD=your-secret \
     -v openchat-conversations:/conversations \
     -v openchat-data:/root/.local/share/opencode \
     ghcr.io/pa2x2/openchat-opencode:<image-tag>
   ```

   Tags are listed on the [releases page](https://github.com/pa2x2/openchat/releases) under `server-opencode-*`. See [docker/opencode](docker/opencode/README.md) for Compose, volumes and config.

   You can also use [example docker-compose.yml](https://github.com/pa2x2/openchat/blob/main/docker/opencode/docker-compose.yml)

3. In the app, open Settings and enter the server URL (for example `http://192.168.1.10:4096`) and the password.

You can also run plain `opencode serve` instead of the image. In that case, start it from an empty directory so the app's chats stay apart from your other OpenCode sessions.

## Contributing

Build instructions and the dev workflow are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
