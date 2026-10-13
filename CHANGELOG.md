# Changelog

## [1.3.0](https://github.com/wungjyan/framefolio/compare/1.2.0...1.3.0) (2026-10-13)


### Features

* add a Chinese and English interface ([d14c752](https://github.com/wungjyan/framefolio/commit/d14c7524361f5ecfbf7a633e18de457e7c79c72b))
* add a Chinese and English interface ([baa1645](https://github.com/wungjyan/framefolio/commit/baa164592f618b4f56978e55236721b8ab49e29f))


### Bug Fixes

* keep the viewer footer space when a photo has no EXIF ([cd8a10a](https://github.com/wungjyan/framefolio/commit/cd8a10a42abde4e508ab2dc90e17a473be6b53ad))

## [1.2.0](https://github.com/wungjyan/framefolio/compare/1.1.0...1.2.0) (2026-09-18)


### Features

* show the running image version in the admin header ([81b4422](https://github.com/wungjyan/framefolio/commit/81b4422037e1128512051b4b40f8b934bafcb07d))

## [1.1.0](https://github.com/wungjyan/framefolio/compare/1.0.0...1.1.0) (2026-09-18)


### Features

* add a theme toggle and highlight notices that are not live yet ([b0a7786](https://github.com/wungjyan/framefolio/commit/b0a7786b32c2a6b9fe2e692411c0c590e2344f31))


### Bug Fixes

* answer the sync request immediately instead of awaiting the run ([d0ba157](https://github.com/wungjyan/framefolio/commit/d0ba157af1389f45836cdb408e4169a0d340b605))
* give the storage source switch the same message in both directions ([6adcdf0](https://github.com/wungjyan/framefolio/commit/6adcdf0796543476e6ada27aa1944eb59c849b50))
* reconcile object storage against the index on every sync ([70d57c9](https://github.com/wungjyan/framefolio/commit/70d57c9d244f70630a741a3a6c263d539704320a))
* report what object storage holds, not what the index claims ([7cae488](https://github.com/wungjyan/framefolio/commit/7cae488466bdb04aab20fd641f5df0bf35a3066e))
* tell the local change set apart from sync progress ([d880fbd](https://github.com/wungjyan/framefolio/commit/d880fbdc84db4d682d301602f9d38fb20898220b))

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
