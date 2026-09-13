FROM node:24-alpine

RUN apk add --no-cache git openssh-client curl
WORKDIR /app

COPY . .

ENV PORT=3333
ENV NODE_ENV=production

EXPOSE 3333

CMD ["node", "server.mjs"]
