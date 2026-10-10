FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
# Prisma 7's migration engine needs the Debian OpenSSL runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && mkdir -p src/generated .next private/documents && chmod 700 private/documents && chown -R node:node /app
USER node

FROM dependencies AS build
COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1
# No database access or secrets are needed to produce the image.
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 TZ=UTC
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts /app/tsconfig.json /app/package.json ./
RUN mkdir -p /app/private/documents && chmod 700 /app/private/documents && chown -R node:node /app/private
USER node
EXPOSE 3000
CMD ["node", "server.js"]
