# Construccion del editor. Se ejecuta desde la raiz del monorepo:
#   docker build -f apps/editor/Dockerfile -t mapa-editor .

FROM node:24-alpine AS deps
WORKDIR /repo
# Solo los manifiestos primero: mientras no cambien, esta capa se reutiliza y
# la instalacion no vuelve a correr en cada build.
COPY package.json package-lock.json ./
COPY packages/auth/package.json           packages/auth/
COPY packages/file-storage/package.json   packages/file-storage/
COPY packages/map-generator/package.json  packages/map-generator/
COPY packages/postgres/package.json       packages/postgres/
COPY packages/project-store/package.json  packages/project-store/
COPY apps/editor/package.json             apps/editor/
RUN npm ci --ignore-scripts

FROM deps AS build
WORKDIR /repo
COPY packages/ packages/
COPY apps/editor/ apps/editor/
RUN npm run build --workspace @mapa-mexico/editor

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

# Nitro deja un servidor autocontenido: no hay node_modules que copiar.
COPY --from=build /repo/apps/editor/.output ./

# Corre sin privilegios. Los volumenes montados deben pertenecer a este uid.
USER node

EXPOSE 3000
# 127.0.0.1 y no localhost: en Alpine localhost puede resolver a ::1, y un
# healthcheck que falla deja al contenedor unhealthy -- que para Traefik es
# indistinguible de no existir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/auth/me >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
