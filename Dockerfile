# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@11.0.8 --activate

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN PUPPETEER_SKIP_DOWNLOAD=true pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
  && node -e "Promise.all([import('sharp'), import('tsx')])"

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3123
ENV NUXT_GALLERY_DATA_DIR=/app/data

RUN mkdir -p /app/data/originals /app/data/generated \
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
