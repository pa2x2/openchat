ARG OPENCODE_VERSION=2.0.18
ARG BASE_IMAGE=ghcr.io/anomalyco/opencode
FROM ${BASE_IMAGE}:${OPENCODE_VERSION}

COPY opencode.json /root/.config/opencode/opencode.json

WORKDIR /conversations

EXPOSE 4096

ENTRYPOINT ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]
