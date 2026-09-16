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

WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY package.json ./
COPY scripts ./scripts
COPY shared ./shared

# Create the full runtime layout so a fresh named volume works without the app
# needing to create directories, and take ownership of everything above. The
# chown must come AFTER the COPY lines: applying it earlier leaves the copied
# files owned by root, and the container runs as `node`.
RUN mkdir -p /app/data/originals /app/data/generated /app/data/incoming \
      /app/data/.trash /app/data/.state \
  && chown -R node:node /app

# Make the code world-readable, independently of its owner.
#
# `chown node:node` above is not enough. Compose overrides USER with
# `PUID:PGID`, and a NAS commonly runs as something like 1026:100. Ownership by
# uid 1000 then grants that user nothing, so `scripts/` and `shared/` become
# unreadable and every sync fails with EACCES — both the button and the CLI,
# since both spawn the same script.
#
# `a+rX` adds read for all, plus execute only where it already applies (the X),
# so directories stay traversable and no stray file becomes executable. Only
# /app/data needs to be writable, and that is a bind mount whose host
# permissions decide access, not the image.
RUN chmod -R a+rX /app/package.json /app/scripts /app/shared /app/.output \
      /app/node_modules

# Fail the build if any code file is unreadable by a user other than its owner.
#
# The previous guard ran as `node`, which is exactly the owner, so it passed
# even for 0600 files and could not catch this. Checking the permission bits
# instead answers the real question: can an arbitrary PUID read this?
RUN if find /app/package.json /app/scripts /app/shared /app/.output \
      ! -perm -004 -print -quit | grep -q .; then \
      echo "ERROR: code is not world-readable, so a PUID other than 1000 cannot run the sync" >&2; \
      exit 1; \
    fi

USER node

EXPOSE 3123

CMD ["node", ".output/server/index.mjs"]
