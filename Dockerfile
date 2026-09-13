FROM node:24-alpine

RUN apk add --no-cache git openssh-client curl
WORKDIR /app

COPY . .

ENV PORT=3333
ENV NODE_ENV=production
# This image is always deployed behind exactly one reverse-proxy hop
# (Coolify's Traefik), which overwrites/appends forwarded headers before
# they reach Node — so trusting them here for the real client IP is safe.
# Override to "false" only if this image is ever run without that proxy.
ENV TRUST_PROXY=true

EXPOSE 3333

CMD ["node", "server.mjs"]
