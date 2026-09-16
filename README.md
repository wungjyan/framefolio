# Framefolio

**English** | [简体中文](./README.zh-CN.md)

Framefolio is a minimalist, self-hosted photo portfolio. It converts original photos into web-friendly images, extracts common EXIF metadata, builds an index, and presents the result as a responsive gallery.

Day-to-day management happens in the web admin area, including uploads, deletions, and syncs. A command-line tool is also available for bulk imports, recovery, and automation. The public gallery serves only processed images and never exposes the originals directly.

## Features

- Responsive photo gallery with Justified and Editorial layouts on desktop and a single-column layout on mobile.
- Full-screen photo viewer with previous/next navigation, keyboard controls, and loading feedback.
- EXIF display for camera, lens, 35mm-equivalent focal length, aperture, shutter speed, ISO, and capture date when available.
- Automatic WebP thumbnails and large previews without exposing the original files through the website.
- Incremental sync, so adding, changing, or removing photos does not require rebuilding the application.
- Built-in `/admin` area for uploads, recoverable deletion, pending-change status, and manual sync, with a mobile-friendly layout.
- S3-compatible object storage with runtime switching between local and object-storage image sources.
- Light and dark themes.

Supported originals: JPEG, PNG, TIFF, and WebP. HEIC, HEIF, AVIF, GIF, and camera RAW are not supported yet.

Default address: `http://localhost:3123`

## Quick start

### Requirements

- Docker Engine
- Docker Compose v2, using the `docker compose` command

### 1. Prepare the directory

```bash
mkdir framefolio
cd framefolio
curl -LO https://raw.githubusercontent.com/wungjyan/framefolio/main/compose.image.yml
mkdir -p data/originals
```

Create a `.env` file next to `compose.image.yml`:

```env
FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-strong-password
```

This is the only setting required to enable the web admin area. Everything else can use its default in local-storage mode.

> If `FRAMEFOLIO_ADMIN_PASSWORD` is not set, the public gallery remains available but the admin API is disabled.

### 2. Start the service

```bash
docker compose -f compose.image.yml up -d gallery
```

### 3. Add photos

The admin area is the recommended method:

1. Open `http://<server-address>:3123/admin`.
2. Sign in with the password from `.env`.
3. Select or drag in photos.
4. Press **Sync now**.

Alternatively, copy photos directly into `data/originals/`, then open `/admin` and press **Sync now**. The photos appear in the public gallery after the sync finishes.

> Uploading or copying photos only changes the originals directory; it does not update the public gallery automatically. A sync generates the derivative images and updates the photo index together.

## Photo management and sync

### Web admin area

The admin area is available at `/admin`. The public gallery does not link to it, so the address must be opened directly.

| Action        | Description                                                                       |
| ------------- | --------------------------------------------------------------------------------- |
| Upload photos | Supports drag and drop, multiple selection, and mobile uploads                    |
| Delete photos | Moves originals to `data/.trash/` instead of deleting them permanently right away |
| Sync now      | Processes all pending changes and updates the public gallery                      |
| Switch source | Switches between local and object storage immediately                             |

After an original is uploaded, deleted, or replaced, the admin area shows the number of pending changes. The public gallery reflects those changes only after a sync completes.

### Command-line sync

The command line is useful for an initial bulk import, rebuilding the index while the web service is unavailable, or integrating sync into an automation script. It shares a lock with web-triggered syncs; if one sync is already running, a later attempt exits immediately instead of writing to the index concurrently.

Using the Docker Hub image:

```bash
docker compose -f compose.image.yml run --rm sync
```

Using a locally built image:

```bash
docker compose run --rm sync
```

Running from source:

```bash
pnpm gallery:sync
```

The command-line sync does not require the admin password, but it uses the same sync pipeline and data directory as the web admin area.

### Sync process

```text
scan data/originals/
  -> generate thumbnails and previews in data/generated/
  -> update the index at data/photos.json
  -> remove derivative images no longer referenced by the index
```

Changes become visible at the following points:

| Action              | Before sync                                                                                     | After sync                            |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| Upload              | The public gallery is unchanged; the admin area marks the photo as pending addition             | The photo appears in the gallery      |
| Delete              | The public gallery still shows the photo; the admin area marks it as pending deletion           | The photo disappears from the gallery |
| Replace an original | The public gallery continues to show the old version; the admin area marks it as pending update | The gallery shows the new version     |

Deleting a photo moves its original into `data/.trash/`. To recover it, move the file back into `data/originals/` and sync again. The trash directory is never cleaned automatically.

## Configuration

Docker Compose reads `.env` from the directory containing the compose file. See [`.env.example`](./.env.example) for the complete example configuration.

### Admin area

| Variable                       | Default        | Description                                                                                                          |
| ------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `FRAMEFOLIO_ADMIN_PASSWORD`    | empty          | Admin login password; when empty, admin API routes return 404 and `/admin` displays a disabled message               |
| `FRAMEFOLIO_SESSION_TTL`       | `604800`       | Login lifetime in seconds; defaults to 7 days                                                                        |
| `FRAMEFOLIO_SESSION_SECRET`    | admin password | Signing key for the login cookie; changing it separately invalidates existing sessions without changing the password |
| `FRAMEFOLIO_MAX_UPLOAD_BYTES`  | `104857600`    | Maximum size of one uploaded file; defaults to 100 MB                                                                |
| `FRAMEFOLIO_MAX_UPLOAD_PIXELS` | `120000000`    | Maximum total pixels in one image; defaults to 120 megapixels to limit memory use during decoding                    |

The public gallery does not require a login. Enabling the admin area does not change public-gallery access.

### Port and image

| Variable           | Default                      | Description                                                                       |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------- |
| `FRAMEFOLIO_PORT`  | `3123`                       | Port exposed on the host                                                          |
| `FRAMEFOLIO_IMAGE` | `wungjyan/framefolio:latest` | Container image to run; production deployments should pin an explicit version tag |

### Linux and NAS file permissions

The container runs as `1000:1000` by default. That identity must be able to write to the host's `data/` directory, or uploads, deletions, and syncs will fail with a permission error.

On Linux or a NAS, first inspect the owner of `data/`:

```bash
ls -ldn data
```

If the reported UID and GID are not `1000 1000`, put the actual values in `.env`. For example:

```env
PUID=1026
PGID=100
```

If the current account created `data/`, its IDs can also be found with:

```bash
id -u
id -g
```

Verify write access with:

```bash
docker compose -f compose.image.yml run --rm --entrypoint sh gallery \
  -c 'id && touch /app/data/.write-test && echo "writable" && rm /app/data/.write-test'
```

- `writable`: the permission configuration works.
- `Permission denied`: check that `PUID` and `PGID` match the owner of `data/`.

Docker Desktop on macOS and Windows does not normally enforce matching UID/GID values for mounted directories, so these variables usually do not need to be changed there. The write test is most meaningful on Linux and NAS systems.

> `PUID` and `PGID` apply to both the `gallery` and `sync` services because both write to `data/`.

## Object storage and CDN

Framefolio supports S3-compatible object storage, including Cloudflare R2, AWS S3, Alibaba Cloud OSS, and MinIO. Without object-storage configuration, all images are served locally.

### How it works

Once object storage is fully configured, each sync keeps the local derivatives and also uploads the thumbnails and previews to object storage. `FRAMEFOLIO_STORAGE_SOURCE` controls which kind of image URL the public gallery uses; it does not control whether uploads happen:

| `FRAMEFOLIO_STORAGE_SOURCE` | Image source used by the public gallery                                                        | Upload to object storage during sync           |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `local`                     | Local `/media/...` URLs                                                                        | Yes, whenever the S3 configuration is complete |
| `r2`                        | `FRAMEFOLIO_S3_PUBLIC_BASE_URL`; photos that were not uploaded successfully fall back to local | Yes                                            |

This design keeps object storage current even while the gallery is serving local URLs, so it can be enabled later without reprocessing photos. An upload failure does not interrupt local publishing; the affected photo continues to use a local URL and a later sync retries the upload.

> The source selected in the admin area is saved to `data/.state/storage.json` and takes precedence over `FRAMEFOLIO_STORAGE_SOURCE`. The environment variable is therefore the initial value for a fresh deployment, not a setting that overwrites the admin choice on every restart.

### Cloudflare R2 configuration example

The following walkthrough uses Cloudflare R2 only as a complete example. Framefolio is not limited to R2: other S3-compatible services work as well, with the provider-specific endpoint, region, credentials, and addressing mode.

1. Create an R2 bucket.
2. Create an R2 API token with **Object Read & Write** permission, scoped to the specific Framefolio bucket where possible. Framefolio needs to upload, list, and delete objects; it does not need **Admin Read & Write**. See the [Cloudflare R2 API token documentation](https://developers.cloudflare.com/r2/api/tokens/) for the current steps.
3. Configure a public address for the bucket. A custom domain is recommended for production; `r2.dev` is better suited to testing.
4. Add the configuration to `.env`:

```env
# Initial source: local or r2
FRAMEFOLIO_STORAGE_SOURCE=local

# R2 S3 API endpoint; do not append the bucket name
FRAMEFOLIO_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
FRAMEFOLIO_S3_REGION=auto
FRAMEFOLIO_S3_BUCKET=example-bucket
FRAMEFOLIO_S3_ACCESS_KEY_ID=example-access-key
FRAMEFOLIO_S3_SECRET_ACCESS_KEY=example-secret-key

# Public address of the bucket, such as its custom domain
FRAMEFOLIO_S3_PUBLIC_BASE_URL=https://img.example.com

# Optional; normally empty for a dedicated bucket
FRAMEFOLIO_S3_PREFIX=
FRAMEFOLIO_S3_FORCE_PATH_STYLE=false
```

`FRAMEFOLIO_S3_ENDPOINT` is the S3 API service address. Put the bucket name in `FRAMEFOLIO_S3_BUCKET` instead. For example, do not use `https://<account-id>.r2.cloudflarestorage.com/example-bucket` as the endpoint.

After a token is created, Cloudflare provides an Access Key ID and Secret Access Key. They map to `FRAMEFOLIO_S3_ACCESS_KEY_ID` and `FRAMEFOLIO_S3_SECRET_ACCESS_KEY`, respectively. The Secret Access Key is normally shown only once; store it securely and never commit it to the repository.

### Variables

| Variable                          | Default | Description                                         |
| --------------------------------- | ------- | --------------------------------------------------- |
| `FRAMEFOLIO_STORAGE_SOURCE`       | `local` | Initial image source: `local` or `r2`               |
| `FRAMEFOLIO_S3_ENDPOINT`          | empty   | S3 API service address, without the bucket name     |
| `FRAMEFOLIO_S3_REGION`            | `auto`  | S3 region; Cloudflare R2 uses `auto`                |
| `FRAMEFOLIO_S3_BUCKET`            | empty   | Bucket name                                         |
| `FRAMEFOLIO_S3_ACCESS_KEY_ID`     | empty   | S3 Access Key ID                                    |
| `FRAMEFOLIO_S3_SECRET_ACCESS_KEY` | empty   | S3 Secret Access Key                                |
| `FRAMEFOLIO_S3_PUBLIC_BASE_URL`   | empty   | Public base address used by browsers to load images |
| `FRAMEFOLIO_S3_PREFIX`            | empty   | Optional directory prefix added to every object key |
| `FRAMEFOLIO_S3_FORCE_PATH_STYLE`  | `false` | Whether S3 API requests use path-style addressing   |

#### `FRAMEFOLIO_S3_PREFIX`

This variable adds a shared prefix to every Framefolio object in the bucket. It is useful when several sites or applications share one bucket. For example:

```env
FRAMEFOLIO_S3_PREFIX=framefolio
```

Objects are stored as:

```text
framefolio/<derivative-id>-thumbnail.webp
framefolio/<derivative-id>-preview.webp
```

Leave it empty when the bucket is dedicated to one Framefolio instance.

> Do not change the prefix directly after object-storage syncs have already completed. The current index records whether each photo revision was uploaded, but changing only the prefix does not trigger unchanged photos to upload again. If the prefix must change, keep the gallery on the local source, move the existing objects from the old prefix to the new one, verify remote completeness in the admin area, and only then switch the image source.

#### `FRAMEFOLIO_S3_FORCE_PATH_STYLE`

This variable controls how the bucket is addressed in S3 API requests:

- `false`: virtual-hosted style, such as `https://<bucket>.<endpoint>/<object>`.
- `true`: path style, such as `https://<endpoint>/<bucket>/<object>`.

Cloudflare R2, AWS S3, and most cloud object-storage services normally use `false`. MinIO and other self-hosted S3 services commonly require `true`. This setting affects only the S3 API requests made by Framefolio; it does not change `FRAMEFOLIO_S3_PUBLIC_BASE_URL`.

### Enable and verify

Recreate the `gallery` service after editing `.env`:

```bash
docker compose -f compose.image.yml up -d gallery
```

Open `/admin`, check the object-storage connection, and run a sync. Existing photos are not uploaded to newly configured object storage until that sync runs. Once the admin area reports that the remote objects are complete, switch the image source to **Object storage**.

`FRAMEFOLIO_S3_PUBLIC_BASE_URL` is used only to build public image URLs. It can be an R2 custom domain, `r2.dev`, or the public address of another S3-compatible service. Without a public base URL, objects can still be uploaded, but the public gallery continues to use local image URLs.

## Data and backups

| Path               | Contents                                          | Backup guidance                                           |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| `data/originals/`  | Original photos                                   | Must be backed up; this is the primary irreplaceable data |
| `data/photos.json` | Photo index and EXIF metadata                     | Recommended; keeping it avoids unnecessary rebuild time   |
| `data/.state/`     | Runtime state such as the selected storage source | Recommended                                               |
| `data/generated/`  | WebP thumbnails and previews                      | Optional; a sync can regenerate it                        |
| `data/.trash/`     | Deleted originals                                 | Depends on recovery needs; never cleaned automatically    |

Both `data/photos.json` and `data/generated/` can be rebuilt from `data/originals/`. After restoring a backup, run one sync to rebuild the public gallery.

## Updates and operations

Check service status:

```bash
docker compose -f compose.image.yml ps
```

Follow logs:

```bash
docker compose -f compose.image.yml logs -f gallery
```

Stop the service:

```bash
docker compose -f compose.image.yml down
```

Pull a newer image and recreate the service:

```bash
docker compose -f compose.image.yml pull
docker compose -f compose.image.yml up -d gallery
```

Production deployments should pin an explicit version with `FRAMEFOLIO_IMAGE` and back up `data/originals/` before updating.

### Upgrading from an older version

If an older `data/photos.json` is incompatible with the current index format, the public gallery reports that the index must be rebuilt. Open `/admin` and run **Sync now**, or use the command-line sync.

The first rebuild may need to regenerate every derivative. Later syncs return to incremental processing. For a large library, use the command-line sync to see live progress.

## Security recommendations

- Use a long, randomly generated value for `FRAMEFOLIO_ADMIN_PASSWORD`.
- When `/admin` is exposed to the internet, add another authentication layer at the reverse proxy, such as Cloudflare Access or HTTP Basic Auth.
- Use HTTPS for public deployments so login credentials and session cookies are not sent in clear text.
- Back up `data/originals/` regularly, and include `data/.trash/` when recovery of deleted originals matters.

`robots.txt` and `noindex` response headers only reduce the chance that the admin area is indexed by search engines; they are not access controls. An unauthenticated visitor can still open the `/admin` login page. The actual protection comes from the admin password and any reverse-proxy authentication.

## Running from source

### Requirements

- Node.js `^22.19.0`, `^24.11.0`, or `>=26.0.0`
- pnpm 11

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
corepack enable
pnpm install
```

Development mode:

```bash
pnpm dev
```

Development mode reads `.env` and then `.env.local`. Settings intended only for the local machine can go in `.env.local`, which is ignored by Git:

```env
FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-local-password
```

Production mode:

```bash
pnpm build
FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-strong-password \
  NITRO_HOST=0.0.0.0 \
  NITRO_PORT=3123 \
  node .output/server/index.mjs
```

The admin password is not needed at build time. It is read when the server starts.

### Configuration loading rules

| Run mode                        | `.env` | `.env.local`                  | Process environment variables |
| ------------------------------- | ------ | ----------------------------- | ----------------------------- |
| `pnpm dev`                      | read   | read with higher priority     | highest priority              |
| `pnpm gallery:sync`             | read   | read with higher priority     | highest priority              |
| `node .output/server/index.mjs` | read   | not read                      | highest priority              |
| Docker Compose                  | read   | not passed into the container | highest priority              |

At startup, the server logs the names of configuration keys loaded from files, but never their values.

### Build a container image from source

The repository contains two Compose files:

| File                 | Image source                         | Intended use                                  |
| -------------------- | ------------------------------------ | --------------------------------------------- |
| `compose.image.yml`  | Pulls the published Docker Hub image | Normal deployment; recommended                |
| `docker-compose.yml` | Builds an image from local source    | Development, debugging, or code customization |

Build and start from source:

```bash
git clone https://github.com/wungjyan/framefolio.git
cd framefolio
cp .env.example .env
# Edit .env and set at least the admin password
docker compose build
docker compose up -d gallery
```

The two Compose files provide the same services, mounts, environment variables, and healthcheck. The only difference is where the image comes from.

### Development commands

```bash
pnpm dev          # start the development server
pnpm build        # create a production build
pnpm test         # run unit tests
pnpm typecheck    # run type checking
pnpm lint         # run lint checks
pnpm format       # format code and documentation
```

## Troubleshooting

### `/admin` says the admin area is not enabled

`FRAMEFOLIO_ADMIN_PASSWORD` is missing or empty. Add it and recreate the `gallery` service:

```bash
docker compose -f compose.image.yml up -d gallery
```

The public gallery is unaffected and remains available.

### Sync fails with `EACCES` or `Permission denied`

The container identity does not match the permissions on `data/`. Linux and NAS users should follow [Linux and NAS file permissions](#linux-and-nas-file-permissions) to check `PUID` and `PGID`.

### Photos were uploaded, but the public gallery did not change

Uploading and copying files does not publish them automatically. Open `/admin` and press **Sync now**, or run:

```bash
docker compose -f compose.image.yml run --rm sync
```

### A deleted photo still appears in the public gallery

Deleting only moves the original into `data/.trash/`. The photo disappears from the public gallery after the next sync completes.

### Object storage is configured, but the admin area cannot switch to it

Check that every required `FRAMEFOLIO_S3_*` variable reaches the container, then recreate the `gallery` service after editing `.env`. Inspect the logs with:

```bash
docker compose -f compose.image.yml logs gallery
```

## Maintainers: publishing Docker images

<details>
<summary>Show publishing instructions</summary>

After signing in to Docker Hub, use the publishing script to build and push a multi-platform image:

```bash
docker login
./scripts/docker-publish.sh 1.0.0
```

By default, it pushes:

```text
wungjyan/framefolio:1.0.0
wungjyan/framefolio:latest
```

Override the repository, build platforms, or npm registry with environment variables:

```bash
IMAGE_REPOSITORY=example/framefolio \
PLATFORMS=linux/amd64,linux/arm64 \
NPM_REGISTRY=https://registry.npmjs.org \
./scripts/docker-publish.sh 1.0.0
```

Set `PUBLISH_LATEST=false` to publish only the explicit version tag.

</details>

## License

Framefolio is available under the [MIT License](./LICENSE).
