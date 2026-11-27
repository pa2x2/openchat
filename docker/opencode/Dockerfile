ARG OPENCODE_VERSION=2.4.2
ARG BASE_IMAGE=ghcr.io/anomalyco/opencode
FROM ${BASE_IMAGE}:${OPENCODE_VERSION}

COPY opencode.json /root/.config/opencode/opencode.json
COPY prompts /root/.config/opencode/prompts
# Outside the /conversations volume, which would hide it on existing installs.
COPY scheduled/opencode.json /scheduled/opencode.json

# An unset TZ makes the server refuse every scheduled task.
ENV TZ=UTC

WORKDIR /conversations

EXPOSE 4096

ENTRYPOINT ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]
