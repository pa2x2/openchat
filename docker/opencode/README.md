# openchat-opencode

Pre-built OpenCode server image for OpenChat.

## Run

```sh
docker run -d --name openchat-opencode \
  -p 4096:4096 \
  -e OPENCODE_SERVER_PASSWORD=your-secret \
  -v openchat-conversations:/conversations \
  -v openchat-data:/root/.local/share/opencode \
  ghcr.io/pa2x2/openchat-opencode:latest
```

`latest` is the newest published image. To stay on one, use a tag from the [releases page](https://github.com/pa2x2/openchat/releases) instead: the part after `server-opencode-`, for example `2.0.18-3`.

## Compose

```sh
OPENCODE_SERVER_PASSWORD=your-secret docker compose -f docker/opencode/docker-compose.yml up -d
```

### Environment

| Variable                   | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `OPENCODE_SERVER_PASSWORD` | Server password (HTTP basic auth, user `opencode`).    |
| `OPENCODE_SERVER_USERNAME` | Override the basic-auth username (default `opencode`). |
| `TZ`                       | Time zone of scheduled tasks (default `UTC`).          |

### Time zone

Scheduled tasks run in the server's time zone, so a task set for 8:00 runs at 8:00 in `TZ`. Set it to your IANA zone, such as `Europe/Berlin`:

```sh
TZ=Europe/Berlin OPENCODE_SERVER_PASSWORD=your-secret docker compose -f docker/opencode/docker-compose.yml up -d
```

With `docker run`, add `-e TZ=Europe/Berlin`. An unknown zone makes the server refuse new tasks.

### Scheduled tasks

Chats with scheduled tasks are kept in `/scheduled`, whose config compacts the conversation early, so a run sends a summary of earlier runs instead of the whole chat. Tasks set to start fresh run as the `scheduled` agent in a session of their own.

### Volumes

| Path                          | Purpose                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `/conversations`              | Dedicated conversations directory (the server workdir).                                        |
| `/root/.local/share/opencode` | Server state: `auth.json`, database. Persist to keep logins.                                   |
| `/root/.config/opencode`      | Config dir. Holds the baked `opencode.json` and `prompts/`; mount files here to override them. |
