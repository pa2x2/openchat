# openchat-opencode

Pre-built OpenCode server image for OpenChat.

## Run

```sh
docker run -d --name openchat-opencode \
  -p 4096:4096 \
  -e OPENCODE_SERVER_PASSWORD=your-secret \
  -v openchat-conversations:/conversations \
  -v openchat-data:/root/.local/share/opencode \
  ghcr.io/pa2x2/openchat-opencode:<image-tag>
```

## Compose

```sh
OPENCODE_SERVER_PASSWORD=your-secret docker compose -f docker/opencode/docker-compose.yml up -d
```

Replace `<image-tag>` in `docker-compose.yml` with the published tag.

### Environment

| Variable                   | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `OPENCODE_SERVER_PASSWORD` | Server password (HTTP basic auth, user `opencode`).    |
| `OPENCODE_SERVER_USERNAME` | Override the basic-auth username (default `opencode`). |

### Volumes

| Path                          | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `/conversations`              | Dedicated conversations directory (the server workdir).                        |
| `/root/.local/share/opencode` | Server state: `auth.json`, database. Persist to keep logins.                   |
| `/root/.config/opencode`      | Config dir. Holds the baked `opencode.json`; mount a file here to override it. |
