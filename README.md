# Framefolio

[English](./README.md) | [简体中文](./README.zh-CN.md)

Framefolio is a minimalist, self-hosted photo portfolio. Place photos in the data directory and run a sync to generate web-ready images and a photo index. A built-in admin area at `/admin` lets you upload, delete, and sync from a browser — including from a phone — so routine photo updates no longer require a terminal.

## Features

- Responsive photo gallery with Justified and Editorial layouts on desktop, plus a single-column mobile layout.
- Full-screen photo viewer with previous/next navigation, keyboard controls, and a loading indicator.
- Displays available EXIF metadata: camera, lens, 35mm-equivalent focal length, aperture, shutter speed, ISO, and capture date.
- Generates WebP thumbnails and large previews without exposing original photos through the website.
- Incrementally syncs photos; adding, changing, or removing originals does not require rebuilding the app.
- Admin area at `/admin` for uploading, deleting, and triggering a sync, with a clear "pending changes" view and a mobile-friendly layout.
- Optional object-storage (S3-compatible, e.g. Cloudflare R2) delivery, with a switch between local and CDN sources and per-photo fallback to local for anything not yet uploaded.
- Light and dark themes.

JPEG, PNG, TIFF, and WebP originals are supported. HEIC, HEIF, AVIF, GIF, and camera RAW files are not currently supported.

The default address is `http://localhost:3123`.

## First: the two compose files

The repository ships **two** compose files with different purposes. **You only need one of them.**

| File                 | Image source                         | When to use it                                                               |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `compose.image.yml`  | Pulls the published Docker Hub image | **Recommended.** Use this to deploy on a NAS: no source code, no local build |
| `docker-compose.yml` | Builds the image from local source   | Only when you are **changing the code**                                      |

They are otherwise identical — same container, mounts, environment variables, and healthcheck. The only difference is where the image comes from:

- `compose.image.yml` needs neither the source tree nor a several-minute build on the NAS
- `docker-compose.yml` runs `docker compose build` first, which is what you want after editing code

> So for deployment, **use `compose.image.yml`** and ignore `docker-compose.yml` entirely.

## Deployment

### Option 1: Use the Docker Hub image (recommended — this is the NAS path)

This requires neither the source code nor a local build. The image supports both `linux/amd64` (the Intel chips common in Synology/QNAP NAS units) and `linux/arm64` (Apple Silicon, some ARM NAS units).

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals data/generated
```

Create a `.env` file (**it must sit next to `compose.image.yml`**):

```env
FRAMEFOLIO_PORT=3123
PUID=1000
PGID=1000

# Required to use the admin area
FRAMEFOLIO_ADMIN_PASSWORD=choose-a-strong-password
```

Then pull and start:

```bash
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml up -d gallery
```

Open `http://your-host:3123/admin`, sign in, and press **Sync now**. The photos appear on the home page.

`PUID` and `PGID` control the host user identity used when writing files. On Linux and NAS systems, use `id -u` and `id -g` to find the right values; update them if they are not `1000`, or the sync may fail with a permission error.

> **Those three settings are everything local mode needs.** No object storage, no domain, no CDN.

### About S3 / object storage: you can skip it for now

**If you only use local mode, you do not need to set any `FRAMEFOLIO_S3_*` variable.** That is the default state:

- `FRAMEFOLIO_STORAGE_SOURCE` defaults to `local`, and images are served by this machine's `/media/` route
- With no object storage configured, a sync writes local files only and **makes no network uploads at all**
- The public gallery, the admin area, upload, delete, and sync all work normally

When you would actually need it:

| Your situation                                      | Set up S3?                            |
| --------------------------------------------------- | ------------------------------------- |
| Only you look at the gallery, and the speed is fine | **No** — leave the defaults           |
| Remote access is slow and you want CDN caching      | Yes, see "Object storage (CDN)" below |
| You already have R2 / OSS                           | Yes                                   |

Adding it later is fine: **add the settings, restart, switch in the admin area.** No redeploy, and no reprocessing of existing photos.

> **Upgrading from a version without the admin area?** The photo index format changed, so the public gallery shows an error until you sync once. Just open `/admin` and press **Sync now**. The first sync regenerates all thumbnails because the old index cannot be reused; later syncs are incremental.

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
pnpm gallery:sync
pnpm dev
```

**To use the admin area, start with the password set.** Without it, `/admin` shows "admin not enabled" instead of a login form:

```bash
FRAMEFOLIO_ADMIN_PASSWORD=your-password pnpm dev
```

> The command-line sync (`pnpm gallery:sync`) does **not** need the admin password; it is independent of the admin area.

For a production process:

```bash
FRAMEFOLIO_ADMIN_PASSWORD=your-password NITRO_HOST=0.0.0.0 NITRO_PORT=3123 node .output/server/index.mjs
```

(You can also put the variables in `.env`, which Nuxt reads automatically.)

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

### From the admin area (recommended)

Open `/admin`, sign in, then upload or delete photos and press **Sync now**.

**Uploads and deletions do not take effect until you sync.** They only change the
files in `data/originals/`; the public gallery is updated by the sync, which
generates the images and writes the index in one operation. The admin area always
shows how many changes are pending, and a deletion keeps the photo visible on the
site until you sync.

Deleting a photo moves its original to `data/.trash/` rather than erasing it, so
a mistake is recoverable: move the file back and sync again. Nothing is deleted
from `.trash/` automatically.

### From the command line

The command-line sync still works and is useful for large first imports, for
recovering when the web service is down, and for scripting. It shares a lock with
the web trigger, so the two can never run at the same time.

When running directly from source:

```bash
pnpm gallery:sync
```

When using a locally built image:

```bash
docker compose run --rm sync
```

When using the Docker Hub image:

```bash
docker compose -f compose.image.yml run --rm sync
```

### What syncing touches

Syncing updates `data/photos.json` and `data/generated/`. It is safe to run while
the gallery is serving; refresh the page when it completes, without restarting the
container.

### Backup

Back up at least `data/originals/` — it is the only irreplaceable data, and
`data/photos.json` can be rebuilt from it by syncing.

Also worth backing up: `data/photos.json` and `data/.state/` (saved settings).

Safe to skip: `data/generated/` (regenerated on demand) and `data/.trash/`
(deleted photos awaiting permanent removal).

## Admin area

The admin area lives at `/admin`. There is deliberately no link to it from the
gallery, so type the URL directly. It is disabled — returning 404 — unless
`FRAMEFOLIO_ADMIN_PASSWORD` is set.

Because `/admin` is reachable from the internet, adding a second layer of
authentication for it at your reverse proxy (Cloudflare Access, or HTTP Basic
Auth) is recommended. `robots.txt` and a `noindex` header keep it out of search
engines, but neither is access control.

## Object storage (CDN)

Images can be served from any S3-compatible object storage — Cloudflare R2 is the
intended target — while local disk keeps working as the fallback.

1. Create a bucket and an API token with object read and write permission.
2. Bind a custom domain to the bucket. Prefer a custom domain over `r2.dev`, which
   is rate-limited and not cached.
3. Add the `FRAMEFOLIO_S3_*` variables to `.env` (see `.env.example`).
4. Restart, then switch the source to **Object storage** in `/admin`.

Syncing uploads derivatives whenever object storage is configured, no matter which
source is currently active. That means **switching sources needs no re-sync**, and
a photo that failed to upload is retried by the next sync. A photo that has not
been uploaded yet falls back to local for that photo only, so a partial upload
never produces broken images.

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
