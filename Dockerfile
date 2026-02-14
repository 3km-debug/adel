FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN useradd -m -u 10001 bot \
  && mkdir -p /app/storage \
  && chown -R bot:bot /app

USER bot

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "scripts/run-healthcheck.js"]

CMD ["node", "src/index.js"]
