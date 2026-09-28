# HazeNow edge proxy. Build context = repository root (the bundle includes packages/core/src/countries):
#   docker build -f services/proxy/Dockerfile -t hazenow-proxy .
#   docker run -p 8080:8080 hazenow-proxy
# Railway: root directory = repo root, config file = services/proxy/railway.json. Region asia-southeast1, 1 replica.
# Env: PORT (set by Railway), REDIS_URL (optional, Railway Redis), NEA_API_KEY (optional), WARM, RATE_LIMIT_PER_MIN.

FROM node:22-alpine AS build
WORKDIR /app
COPY packages/core/src packages/core/src
COPY services/proxy/src services/proxy/src
RUN npx --yes esbuild@0.25.12 services/proxy/src/server.ts \
      --bundle --platform=node --format=esm --target=node20 --sourcemap \
      --outfile=services/proxy/dist/server.js

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY services/proxy/package.json services/proxy/package.json
COPY --from=build /app/services/proxy/dist services/proxy/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "services/proxy"]
