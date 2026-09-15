# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NPM_REGISTRY=https://registry.npmjs.org

FROM ${NODE_IMAGE} AS base

ARG NPM_REGISTRY

ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@11.0.8 --activate \
  && pnpm config set registry "$NPM_REGISTRY"

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--ignore-scripts` skips package build scripts, which is safe because sharp
# ships prebuilt platform binaries as optional dependencies. The guard below
# actually loads every runtime dependency, so a missing or unloadable native
# module fails the build here instead of at the first request.
#
# @aws-sdk/client-s3 is imported by a Nitro chunk as a bare module, so it must
# exist in node_modules at runtime; checking it here catches a dependency that
# was accidentally moved to devDependencies.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
  && node -e "Promise.all([import('sharp'), import('tsx'), import('exifr'), import('@aws-sdk/client-s3')])"

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3123
ENV NUXT_GALLERY_DATA_DIR=/app/data

# Create the full runtime layout so a fresh named volume works without the app
# needing to create directories. With a bind mount these are shadowed by the
# host directory, where the app creates them on demand instead.
RUN mkdir -p /app/data/originals /app/data/generated /app/data/incoming \
    /app/data/.trash /app/data/.state \
  && chown -R node:node /app

WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY package.json ./
COPY scripts ./scripts
COPY shared ./shared

USER node

EXPOSE 3123

CMD ["node", ".output/server/index.mjs"]
