# Framefolio

[English](./README.md) | [简体中文](./README.zh-CN.md)

Framefolio is a minimalist, self-hosted photo portfolio. Place photos in the data directory and run the sync command to generate web-ready images and a photo index.

## Features

- Responsive photo gallery with Justified and Editorial layouts on desktop, plus a single-column mobile layout.
- Full-screen photo viewer with previous/next navigation, keyboard controls, and a loading indicator.
- Displays available EXIF metadata: camera, lens, 35mm-equivalent focal length, aperture, shutter speed, ISO, and capture date.
- Generates WebP thumbnails and large previews without exposing original photos through the website.
- Incrementally syncs photos; adding, changing, or removing originals does not require rebuilding the app.
- Light and dark themes.

JPEG, PNG, TIFF, and WebP originals are supported. HEIC, HEIF, AVIF, GIF, and camera RAW files are not currently supported.

The default address is `http://127.0.0.1:3123` when started with `pnpm exec foo-cli web`.

## Deployment

### Option 1: Use the Docker Hub image (recommended)

This option requires neither the source code nor a local build. The image supports both `linux/amd64` and `linux/arm64`.

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals data/generated
```

Place photos in `data/originals/`, then pull the image, sync the photos, and start the gallery:

```bash
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml run --rm sync
docker compose -f compose.image.yml up -d gallery
```

The default image is `wungjyan/framefolio:latest`. To pin a version or change the port, create a `.env` file in the same directory:

```env
FRAMEFOLIO_IMAGE=wungjyan/framefolio:1.0.0
FRAMEFOLIO_PORT=3123
PUID=1000
PGID=1000
```

`PUID` and `PGID` control the host user identity used by the sync task when it writes files. On Linux, use `id -u` and `id -g` to find the right values; update them if they are not `1000`.

### Option 2: Run directly from source

Best for local use and development. Requires Node.js `^22.19.0`, `^24.11.0`, or `>=26.0.0`, plus pnpm 11.

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
corepack enable
pnpm install
```

Place photos in `data/originals/`, then sync and start the development server:

```bash
pnpm start
```

For a production process:

```bash
pnpm build
NITRO_HOST=0.0.0.0 NITRO_PORT=3123 node .output/server/index.mjs
```

### Option 3: Build a Docker image from source

Best when you need to modify the code or control the build. Requires Docker Engine and Docker Compose v2.

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
cp .env.example .env
docker compose build
```

Place photos in `data/originals/`, then sync and start the gallery:

```bash
docker compose run --rm sync
docker compose up -d gallery
```

## Updating photos

Store original photos in:

```text
data/originals/
```

When running directly from source, `pnpm start` asks whether to run the gallery sync before starting the site. The production server performs the sync automatically:

```bash
pnpm start
pnpm exec foo-cli web
```

When using a locally built image:

```bash
docker compose run --rm sync
```

When using the Docker Hub image:

```bash
docker compose -f compose.image.yml run --rm sync
```

Syncing updates `data/photos.json` and `data/generated/`. It is safe to run while the gallery is serving; refresh the page when it completes, without restarting the container.

Back up at least `data/originals/`. Back up the whole `data/` directory as well if you want to restore without regenerating images.

## Common Docker commands

```bash
# Check status
docker compose ps

# View gallery logs
docker compose logs -f gallery

# Stop services
docker compose down
```

When using the Docker Hub image, add `-f compose.image.yml` to these commands.

## Publishing to Docker Hub

Maintainers can build and publish multi-platform images with the included script:

```bash
docker login
./scripts/docker-publish.sh 1.0.0
```

By default, the script pushes:

```text
wungjyan/framefolio:1.0.0
wungjyan/framefolio:latest
```

Override the repository, platforms, or npm registry with environment variables:

```bash
IMAGE_REPOSITORY=example/framefolio \
PLATFORMS=linux/amd64,linux/arm64 \
NPM_REGISTRY=https://registry.npmjs.org \
./scripts/docker-publish.sh 1.0.0
```

Set `PUBLISH_LATEST=false` to publish only the specified version tag.

## Documentation

The `docs/` workspace contains the VitePress project documentation, including architecture diagrams, dependency/interface graphs, Mermaid sequence diagrams, and the SDD development guide:

```bash
pnpm exec turbo run docs:dev
pnpm exec turbo run docs:build
```
