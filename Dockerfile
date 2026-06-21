# VERDANT — single image that serves the static client AND the online API.
# Pure Node, zero dependencies, so this is tiny and builds in seconds.
FROM node:20-alpine

WORKDIR /app
# copy the whole repo (client is static; server is server/)
COPY . .

# leaderboard data lives here (mount a volume to persist it)
VOLUME /app/server/data
ENV PORT=8080
EXPOSE 8080

# realtime (chat/co-op) needs a single process; set CLUSTER=auto only if you
# run a separate non-realtime instance for the leaderboard API behind a LB.
CMD ["node", "server/server.js"]
