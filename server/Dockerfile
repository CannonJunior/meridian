# Build context is the repo root (not server/), not this directory — the
# workspace root's package.json + package-lock.json are the source of truth
# npm needs to resolve deps, and `npm ci --workspace` still requires every
# workspace's package.json to exist (even one, like web, that this image
# doesn't otherwise touch) or npm refuses to run. Build with:
#   docker build -f server/Dockerfile -t meridian-server .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
# --workspace=server (npm 9+) resolves and installs only server's dependency
# subtree, not web's (cesium/react/ol/...) — verified empirically, since
# npm workspaces docs don't spell this out clearly. Keeps this image's
# node_modules to ~20MB instead of pulling in an unrelated frontend's deps.
RUN npm ci --workspace=server --include-workspace-root

FROM deps AS build
COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
RUN npm run build -w server

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --workspace=server --include-workspace-root --omit=dev \
  && npm cache clean --force
COPY --from=build /app/server/dist server/dist

EXPOSE 8799
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8799)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
