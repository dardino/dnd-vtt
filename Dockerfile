# syntax=docker/dockerfile:1

# Immagine di distribuzione: un solo container Fastify che serve API, WebSocket e
# il client Angular compilato. SQLite, upload e segreto di sessione vivono in
# /app/data (volume), mai nell'immagine.

FROM node:26-bookworm-slim AS build

WORKDIR /app
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# `npm ci` esegue gli script delle dipendenze native ammesse da `allowScripts`.
# Gli strumenti di compilazione servono se non esiste un prebuild per la
# piattaforma target (in particolare durante la build multi-arch arm64).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# I manifest dei workspace servono a `npm ci` prima di copiare il sorgente.
# `scripts/install-hooks.mjs` va copiato perché `prepare` lo esegue durante
# `npm ci` (con `.git` assente esce subito senza errori).
COPY package.json package-lock.json .npmrc ./
COPY scripts ./scripts
COPY client/package.json ./client/
COPY shared/package.json ./shared/
COPY server/package.json ./server/

RUN npm ci

COPY . .
RUN npm run build \
    && npm run check:bundles -w @dnd-vtt/server

# Solo dipendenze di produzione, con le native ricostruite per la piattaforma
# dell'immagine. Gli strumenti restano in questo stage e non finiscono nel
# runtime: qui non si esegue codice applicativo.
FROM node:26-bookworm-slim AS prod-deps

WORKDIR /app
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Solo le dipendenze di produzione del server: il client è già compilato in
# `build` e non viene eseguito a runtime.
RUN npm ci --omit=dev --ignore-scripts -w @dnd-vtt/server \
    && npm rebuild better-sqlite3 sharp

FROM node:26-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    CLIENT_DIST=client/dist/browser \
    DATABASE_PATH=data/dnd.db \
    UPLOAD_DIR=data/uploads

# package.json della root: `createEnv` lo usa per individuare la repo root e
# risolvere `server/drizzle`, `client/dist/browser` e `data/`.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/client/dist/browser ./client/dist/browser

COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Il named volume eredita proprietario e permessi da questa directory.
RUN mkdir -p /app/data \
    && chown node:node /app/data

USER node

VOLUME ["/app/data"]
EXPOSE 3000
STOPSIGNAL SIGTERM

# `node` 26 ha fetch globale: niente curl/wget nell'immagine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
