FROM node:24-alpine

RUN apk add --no-cache git openssh-client
WORKDIR /app

CMD ["node", "server.mjs"]
