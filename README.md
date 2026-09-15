# Framefolio

[English](./README.md) | [简体中文](./README.zh-CN.md)

Framefolio is a minimalist, self-hosted photo portfolio. It converts your original photos into web-friendly images, builds a photo index, and presents them as a clean gallery.

There are two ways to manage photos: the **web admin area** (recommended, works on a phone) and the **command line** (advanced, for bulk imports or recovery). Day-to-day use needs only the first.

## Features

- Responsive photo gallery with Justified and Editorial layouts on desktop, single-column on mobile.
- Full-screen photo viewer with previous/next navigation, keyboard controls, and a loading indicator.
- Displays available EXIF metadata: camera, lens, 35mm-equivalent focal length, aperture, shutter speed, ISO, and capture date.
- Generates WebP thumbnails and large previews. **Original photos are never exposed through the website.**
- Incremental sync: adding, changing, or removing photos does not require rebuilding the app.
- Built-in `/admin` area for uploading, deleting, and triggering a sync, with a clear "pending changes" view and a mobile-friendly layout.
- Optional object storage (S3-compatible, e.g. Cloudflare R2) for CDN delivery, with a switch between local and CDN sources.
- Light and dark themes.

Supported originals: JPEG, PNG, TIFF, WebP. HEIC, HEIF, AVIF, GIF, and camera RAW are not supported yet.

Default address: `http://localhost:3123`.

---

## Quick start

Get it running the fastest way first; adjust later. **Three steps.**

### 1. Prepare directories and configuration

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals
```

Create a `.env` file (**it must sit next to `compose.image.yml`**):

```env
# Admin password: choose a strong one
FRAMEFOLIO_ADMIN_PASSWORD=choose-a-strong-password
```

> **That is the only setting required.** Everything else has a sensible default, and local
> storage mode needs no further configuration. The [Configuration](#configuration) section
> explains when you would add more.

### 2. Start it

```bash
docker compose -f compose.image.yml up -d gallery
```

### 3. Get photos onto the site

Either way works:

**Option A: upload in the admin area (recommended)**

1. Open `http://your-host:3123/admin`
2. Sign in with the password you set
3. Select photos to upload
4. Press **Sync now**

**Option B: copy files in**

Put photos in `data/originals/` (drag and drop is fine), then press **Sync now** in `/admin`.

> **Uploading or copying photos does not update the site by itself.** You have to press
> **Sync now**, which generates the images and updates the index in one operation.
> See [What a sync actually does](#what-a-sync-actually-does).

Done. Open the home page and your photos are there.

---

## Daily use

### The admin area (recommended)

Open `/admin`. There is deliberately **no link to it from the public gallery**, so type the URL.

| Action        | Notes                                                   |
| ------------- | ------------------------------------------------------- |
| Upload photos | Drag and drop or multi-select; works on a phone         |
| Delete photos | Moves to a recycle bin, so it is **recoverable**        |
| Sync now      | The only thing that makes changes visible               |
| Switch source | Between local and object storage, effective immediately |

**One rule to remember: uploads and deletions do nothing until you press Sync now.**

The admin area always shows how many changes are pending, so you do not have to remember.

### The command line (advanced, optional)

The command-line sync is useful when:

- **Importing hundreds of photos for the first time** — the terminal shows live output, which is more reassuring than waiting on a web page
- **Recovering when the web service is down** — it can rebuild the index on its own
- **Scripting or automating** — you need a directly callable command

It shares a lock with the web trigger, so the two can never run at the same time (whoever is second exits immediately with a message).

```bash
# Docker Hub image (in the same directory as your quick-start setup)
docker compose -f compose.image.yml run --rm sync
```

```bash
# Running directly from source
pnpm gallery:sync
```

```bash
# A locally built image
docker compose run --rm sync
```

> **The command line does not need the admin password.** It is an independent entry point
> that happens to share the same sync pipeline.

### What a sync actually does

This is the one thing worth understanding clearly: **a sync is a single operation, not two.**

```text
scan data/originals/
  -> generate thumbnails and previews (write data/generated/)
  -> write the index (data/photos.json)
  -> remove derivatives that nothing references
```

Generating images and updating the index are two steps of the same operation. So a sync both produces the images and makes the site reflect them.

That gives three consistent behaviours:

| What you did        | Before pressing Sync now                          | After                 |
| ------------------- | ------------------------------------------------- | --------------------- |
| Upload              | Site **unchanged**, marked "pending: added"       | Appears on the site   |
| Delete              | Site **still shows it**, marked "pending: delete" | Removed from the site |
| Replace an original | Site shows the **old image**, marked "changed"    | Updated               |

> **Deletion is the easiest one to forget**: the original is already in the recycle bin, but
> the site still shows it until you sync.

### Backup

```text
Must back up:     data/originals/       <- the only irreplaceable data
Worth backing up: data/photos.json, data/.state/
Safe to skip:     data/generated/       <- regenerated on demand
                  data/.trash/          <- the recycle bin
```

`photos.json` can be rebuilt from `originals/` by syncing, but it holds each photo's EXIF data
and state, so keeping it saves a rebuild. `.state/` stores your settings, such as the selected
storage source.

---

## Configuration

All configuration lives in a `.env` file **next to the compose file you use**. The groups below
are ordered by whether you actually need them.

### Required

Just one:

```env
FRAMEFOLIO_ADMIN_PASSWORD=choose-a-strong-password
```

| Variable                    | Notes                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `FRAMEFOLIO_ADMIN_PASSWORD` | Admin password. **When unset, every admin API route returns 404** and `/admin` explains that the admin area is not enabled. |

> The public gallery needs **no** password and is browsable by anyone. That is intentional.

### Linux / NAS: check `PUID` and `PGID`

```env
PUID=1000
PGID=1000
```

The container runs as `1000:1000` by default. **If your host user is not 1000, writes will fail**
— typically as a permission error during sync. Check and set them:

```bash
id -u    # e.g. 1026  -> PUID=1026
id -g    # e.g. 100   -> PGID=100
```

When this matters:

| Platform                                      | Need to change?                                     |
| --------------------------------------------- | --------------------------------------------------- |
| **Linux / NAS (Synology, QNAP, Unraid, ...)** | **Yes, check it.** Use `id -u` and `id -g`          |
| macOS / Windows with Docker Desktop           | Normally not; desktop mounts do not enforce the UID |

> **Note**: `PUID` / `PGID` affect **both** the gallery container (upload, delete, and sync from
> `/admin`) and the sync container (command line), because both write to `data/`. They are not a
> command-line-only setting.

### Common options

```env
FRAMEFOLIO_PORT=3123
FRAMEFOLIO_IMAGE=wungjyan/framefolio:1.0.0
```

| Variable                       | Default                      | Notes                                                                                                    |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `FRAMEFOLIO_PORT`              | `3123`                       | Port exposed on the host                                                                                 |
| `FRAMEFOLIO_IMAGE`             | `wungjyan/framefolio:latest` | Image to run. Pinning a version is recommended over `latest`                                             |
| `FRAMEFOLIO_SESSION_TTL`       | `604800` (7 days)            | Login lifetime, in seconds                                                                               |
| `FRAMEFOLIO_SESSION_SECRET`    | the admin password           | Signs the login cookie. Rarely needed; setting it invalidates all sessions without changing the password |
| `FRAMEFOLIO_MAX_UPLOAD_BYTES`  | `104857600` (100 MB)         | Maximum size per uploaded file                                                                           |
| `FRAMEFOLIO_MAX_UPLOAD_PIXELS` | `120000000`                  | Maximum pixels per photo, to bound memory while decoding                                                 |

### Advanced: object storage / CDN

**If you use local storage only, none of these are needed.** That is the default, and the
recommended setup for most personal use.

Typical reasons to add it: images are slow to load from outside your network and you want CDN
caching, or you have a large library and want to reduce outbound traffic from the NAS.

See [Object storage (CDN)](#object-storage-cdn).

---

## Object storage (CDN)

Images can be served from any S3-compatible object storage — Cloudflare R2 is the intended
target, but Alibaba OSS, AWS S3, and self-hosted MinIO work too. **Local disk is always kept as
a per-photo fallback.**

### Setup

1. Create a bucket and an API token with **object read and write** permission.
2. Bind a custom domain to the bucket.
   > Prefer a custom domain over `r2.dev`, which is rate-limited and not served through the CDN cache.
3. Add these to `.env`:

```env
FRAMEFOLIO_STORAGE_SOURCE=local

FRAMEFOLIO_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
FRAMEFOLIO_S3_REGION=auto
FRAMEFOLIO_S3_BUCKET=your-bucket
FRAMEFOLIO_S3_ACCESS_KEY_ID=your-access-key
FRAMEFOLIO_S3_SECRET_ACCESS_KEY=your-secret-key

# Public URL: your custom domain
FRAMEFOLIO_S3_PUBLIC_BASE_URL=https://img.example.com
```

4. Restart, then switch the source to **Object storage** in `/admin`.

### How it works

Whenever object storage is configured, **every sync uploads the generated images**, regardless
of which source is currently active. That gives three useful properties:

- **Switching sources needs no re-sync** — only the URL prefix changes; filenames are identical
- **A failed upload self-heals** — the next sync retries it, rather than skipping it forever
- **Photos not yet uploaded fall back to local, one by one** — a partial upload never produces broken images

`FRAMEFOLIO_S3_PUBLIC_BASE_URL` is only a string prefix. A custom domain, `r2.dev`, or a MinIO
address all behave identically; there is no branching in the code.

<details>
<summary>Other optional variables</summary>

| Variable                         | Notes                                                           |
| -------------------------------- | --------------------------------------------------------------- |
| `FRAMEFOLIO_S3_PREFIX`           | Object key prefix, for sharing one bucket between several sites |
| `FRAMEFOLIO_S3_FORCE_PATH_STYLE` | Self-hosted servers such as MinIO usually need `true`           |

</details>

---

## Running from source (development)

Requires Node.js `^22.19.0`, `^24.11.0`, or `>=26.0.0`, plus pnpm 11.

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
corepack enable
pnpm install
```

**Development mode** (hot reload):

```bash
pnpm dev
```

Development reads `.env` and `.env.local`, so you can keep the password in a file instead of
passing it every time:

```env
# .env.local — personal settings, ignored by git
FRAMEFOLIO_ADMIN_PASSWORD=your-password
```

**Production mode**:

```bash
pnpm build
FRAMEFOLIO_ADMIN_PASSWORD=your-password NITRO_HOST=0.0.0.0 NITRO_PORT=3123 \
  node .output/server/index.mjs
```

> Building does not need the password; **running does**.

### How configuration files are loaded

The three ways to run the app read configuration from different places, which is an easy trap:

| How you run it                  | `.env` | `.env.local`        | Real environment variables |
| ------------------------------- | ------ | ------------------- | -------------------------- |
| `pnpm dev` (development)        | ✅     | ✅ (**wins**)       | ✅ (highest)               |
| `node .output/...` (production) | ✅     | ❌ **not read**     | ✅ (highest)               |
| Docker Compose                  | ✅     | ❌ not in the image | ✅                         |

The rules:

1. **A real environment variable always wins** over any file, so container settings cannot be changed by a stray file.
2. **Development** reads `.env` and `.env.local`, with the latter overriding — the usual "personal local overrides" convention.
3. **Production reads only `.env`**, never `.env.local`, so a developer's personal file cannot affect a live deployment.
4. `.env.local` is excluded by both `.gitignore` and `.dockerignore`: it is neither committed nor copied into the image.

> On startup the server logs which settings it loaded and from which file — **key names only,
> never values** — so you can confirm configuration took effect:
>
> ```text
> [framefolio] Loaded 1 setting(s) from .env, .env.local: FRAMEFOLIO_ADMIN_PASSWORD
> ```

> The command-line sync (`pnpm gallery:sync`) is a separate process and reads the same files.

### Building a Docker image from source

Only needed if you are changing the code. Requires Docker Engine and Docker Compose v2.

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
cp .env.example .env      # then edit .env and set the admin password
docker compose build
docker compose up -d gallery
```

### The two compose files

The repository ships **two** compose files with different purposes, and **you only need one**:

| File                 | Image source                         | When to use it                                                      |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `compose.image.yml`  | Pulls the published Docker Hub image | **Recommended.** Use this to deploy: no source code, no local build |
| `docker-compose.yml` | Builds the image from local source   | Only when you are **changing the code**                             |

They are otherwise identical — same container, mounts, environment variables, and healthcheck.
The only difference is where the image comes from.

> So for deployment, **use `compose.image.yml`** and ignore `docker-compose.yml` entirely.

### Development commands

```bash
pnpm dev          # dev server (hot reload)
pnpm build        # production build
pnpm test         # unit tests
pnpm typecheck    # type check
pnpm lint         # lint
pnpm format       # format
```

---

## Troubleshooting

### `/admin` says the admin area is not enabled

`FRAMEFOLIO_ADMIN_PASSWORD` is not set. Set it and restart the container.

The **public gallery is unaffected** and stays reachable.

### Sync fails with a permission error

`PUID` / `PGID` do not match the owner of your files. Common on Linux and NAS. Look up the
correct values with `id -u` and `id -g`, put them in `.env`, and restart.

### Upgrading from an older version

The index format changed, so **the public gallery shows an error until you sync once**.

Open `/admin` and press **Sync now**. The admin area still works before that sync and will tell
you the index needs rebuilding.

> **The first sync regenerates every thumbnail** (the old index cannot be reused); later syncs
> are incremental. Give it a few minutes for a large library.

### I want to switch to a CDN

See [Object storage (CDN)](#object-storage-cdn). You can enable it and switch back at any time,
with no redeploy and no reprocessing of existing photos.

### I deleted a photo but it is still on the site

That is by design: deleting moves the original to `data/.trash/`, and it disappears from the site
only after you press **Sync now**. When you are sure you no longer want it, delete the files in
`.trash/` (nothing there is cleaned up automatically).

---

## Operations

```bash
# Status
docker compose -f compose.image.yml ps

# Logs
docker compose -f compose.image.yml logs -f gallery

# Stop
docker compose -f compose.image.yml down

# Update to a new version
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml up -d gallery
```

### Security

`/admin` can be exposed to the internet, so adding a second layer of authentication at your
reverse proxy (Cloudflare Access, HTTP Basic Auth, ...) is recommended.

`robots.txt` and a `noindex` header only **keep the page out of search engines**; they are
**not access control**. Anyone can open `/admin` and see the login page. The real defence is the
admin password.

---

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
