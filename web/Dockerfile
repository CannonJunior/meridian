# Build context is the repo root (not web/) — see server/Dockerfile's header
# comment for why. Build with:
#   docker build -f web/Dockerfile -t meridian-web .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --workspace=web --include-workspace-root

FROM deps AS build
COPY web/tsconfig.json web/tsconfig.app.json web/tsconfig.node.json web/vite.config.ts web/index.html ./web/
COPY web/src web/src
RUN npm run build -w web

FROM nginx:1.27-alpine AS runtime
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV SERVER_UPSTREAM=server \
    SERVER_PORT=8799
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
