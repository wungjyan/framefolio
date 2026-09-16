# Changelog

## [1.0.1](https://github.com/wungjyan/framefolio/compare/framefolio-1.0.0...framefolio-1.0.1) (2026-09-16)


### Documentation

* document the automated release process ([caa1f4d](https://github.com/wungjyan/framefolio/commit/caa1f4de2067a81f1b979ce516bcee0a46629e29))


### Continuous Integration

* automate releases and Docker publishing ([37b3acb](https://github.com/wungjyan/framefolio/commit/37b3acb11d2de9fdaa039e5cc8f5bb84a1264597))

## [1.0.0](https://github.com/wungjyan/framefolio/compare/0.0.1...1.0.0) (2026-09-16)

### Features

- Add a password-protected web admin area for uploading and deleting photos.
- Add web-triggered incremental synchronization with locking and job tracking.
- Add S3-compatible object storage publishing and runtime source switching.
- Store object keys in the gallery index and resolve public URLs at read time.

### Bug Fixes

- Keep concurrent gallery synchronization from corrupting generated state.
- Keep the admin area usable when the gallery index cannot be read.
- Load local environment configuration consistently.
- Validate upload dimensions and enforce the configured pixel limit.
- Read JPEG and HEIF dimensions when files contain large metadata blocks.
- Make container code readable when the runtime uses a custom PUID and PGID.
- Hide internal trash paths from the photo deletion confirmation dialog.

## 0.0.1 (2026-08-28)

- Initial public release with responsive galleries, EXIF metadata, themes, and Docker deployment.
