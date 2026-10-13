import type { zh } from './zh'

/**
 * English messages.
 *
 * Typed as `Record<MessageKey, string>` against the Chinese catalogue, so
 * omitting a key is a type error (CI fails) and a stale key is caught by the
 * exhaustiveness test. There is no runtime fallback to Chinese: a missing
 * translation should never be able to ship.
 */
export const en: Record<keyof typeof zh, string> = {
  'admin.pageTitle': 'Admin · Framefolio',
  'admin.checking': 'Checking sign-in status…',
  'admin.brand': 'FRAMEFOLIO ADMIN',

  'common.cancel': 'Cancel',
  'common.delete': 'Delete',

  'header.viewSite': 'View site',
  'header.logout': 'Sign out',

  'login.passwordLabel': 'Admin password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.error.empty': 'Enter the admin password.',
  'login.error.invalid': 'Incorrect password.',
  'login.error.throttled': 'Too many attempts. Try again later.',
  'login.error.disabled':
    'Admin is not enabled: the server has no password set.',
  'login.error.network': 'Sign-in failed. Check the connection and try again.',

  'disabled.headline': 'Admin is not enabled',
  'disabled.apiExplanationBefore':
    'No admin password is configured on the server, so every',
  'disabled.apiExplanationAfter': 'route returns 404.',
  'disabled.setEnvBefore': 'Set the',
  'disabled.setEnvAfter': 'environment variable and restart to enable it:',
  'disabled.envComment': '# .env (next to the compose file)',
  'disabled.envExample':
    'FRAMEFOLIO_ADMIN_PASSWORD=replace-with-a-strong-password',
  'disabled.localDev': 'For local development, prefix the command instead:',
  'disabled.localDevExample':
    'FRAMEFOLIO_ADMIN_PASSWORD=your-password pnpm dev',
  'disabled.publicUnaffected':
    'The public gallery is unaffected and always stays reachable.',

  'reindex.headline': 'The index must be rebuilt.',
  'reindex.reason':
    'The existing data/photos.json uses an older format this version cannot read, so every photo shows as “to add”.',
  'reindex.fix': 'Press “Sync now” below to rebuild the index.',
  'reindex.warning': 'Until you sync, the public gallery shows an error state.',
  'reindex.firstRun':
    'The first sync regenerates every thumbnail; later runs are incremental.',

  'section.sync': 'Sync',
  'section.upload': 'Upload photos',
  'section.source': 'Image source',
  'section.photos': 'Photos ({count})',

  'sync.start': 'Sync now',
  'sync.running': 'Syncing…',
  'sync.inProgress': 'Syncing',
  'sync.starting': 'Syncing…',
  'sync.done': 'Sync complete.',
  'sync.doneWithFailures':
    'Sync finished with failures. See the sync panel below.',
  'sync.failed': 'Sync failed.',
  'sync.alreadyRunning': 'A sync is already running. Waiting for it to finish…',
  'sync.pollLost':
    'Could not read sync progress: the connection to the admin API dropped. The run may still be in progress; refresh the page later to see the result.',
  'sync.notice':
    'Uploading and deleting do not take effect immediately. The site changes only after you press “Sync now”.',
  'sync.pending.loading': 'Reading local changes…',
  'sync.pending.count': '{count} pending',
  'sync.pending.clear': 'No local changes pending',
  'sync.never': 'Never synced',
  'sync.lastRun': 'Last sync: {time}',
  'sync.progress': '{phase} · checked {completed} / {total} originals',
  'sync.phase.scanning': 'Scanning originals',
  'sync.phase.processing': 'Processing',
  'sync.phase.finalising': 'Finishing',
  'sync.phase.done': 'Done',
  'sync.phase.unknown': 'Syncing',
  'sync.summary.added': 'Added {count}',
  'sync.summary.updated': 'Updated {count}',
  'sync.summary.skipped': 'Skipped {count}',
  'sync.summary.deleted': 'Deleted {count}',
  'sync.summary.failed': 'Failed {count}',
  'sync.failedCount': '{count} failed to process.',
  'sync.failedHint':
    'Failed photos keep showing their previous version. Fix the original and sync again.',

  'upload.dropzone': 'Choose photos, or drag files here',
  'upload.formats': 'Supports JPG / PNG / WebP / TIFF',
  'upload.progress': 'Uploading… ({done} / {total})',
  'upload.item.uploading': 'Uploading…',
  'upload.item.done': 'Uploaded {size}',
  'upload.item.pending': 'Waiting',
  'upload.errorFallback': 'Upload failed',
  'upload.doneCount': 'Uploaded {count}.',
  'upload.doneStrong': 'These photos are not on the site yet',
  'upload.doneHint': '. Press “Sync now” to publish them.',
  'upload.errorCount': '{count} failed to upload.',
  'upload.clearFinished': 'Clear finished items',
  'upload.notice':
    'Photos uploaded, but not on the site yet. Press “Sync now” to publish them.',

  'photos.empty':
    'No photos yet. Upload some, or drop files into data/originals/, then press “Sync now”.',
  'photos.column.preview': 'Preview',
  'photos.column.filename': 'File name',
  'photos.column.dimensions': 'Dimensions',
  'photos.column.size': 'Size',
  'photos.column.state': 'State',
  'photos.column.actions': 'Actions',
  'photos.state.added': 'To add',
  'photos.state.changed': 'To update',
  'photos.state.pendingDelete': 'To delete',
  'photos.state.unchanged': 'Published',
  'photos.delete.title':
    'Move to trash (removed from the site only after a sync)',
  'photos.delete.disabledTitle': 'This photo is already pending deletion',

  'delete.title': 'Move to trash',
  'delete.questionBefore': 'Move',
  'delete.questionAfter': 'to the trash?',
  'delete.note':
    'The original is not permanently deleted and can still be restored by hand.',
  'delete.noteStrong':
    'The photo stays visible in the public gallery until a sync runs.',
  'delete.busy': 'Deleting…',
  'delete.notice':
    'Moved “{filename}” to the trash. It is still on the site and disappears after the next sync.',
  'delete.failed': 'Delete failed.',

  'storage.group': 'Image source',
  'storage.local.label': 'Local',
  'storage.local.hint': 'Images are served by this server’s /media route',
  'storage.remote.label': 'Object storage (CDN)',
  'storage.remote.unconfigured':
    'Not configured. Set the FRAMEFOLIO_S3_* environment variables first.',
  'storage.remote.baseUrl': 'Base URL: {url}',
  'storage.status.unconfigured':
    'Object storage is selected but incompletely configured, so local storage is still in use.',
  'storage.status.unreadable':
    'Object storage could not be read, so availability in the bucket is unknown right now.',
  'storage.status.available':
    '{available} / {total} photos available from the bucket.',
  'storage.status.completeness': 'Derivative completeness {percent}%.',
  'storage.status.missing':
    '{count} object(s) missing; “Sync now” uploads them.',
  'storage.status.orphaned':
    '{count} unreferenced object(s) will be cleaned up by the next sync.',
  'storage.status.local':
    'Local storage is in use. Switching to object storage needs no reprocessing.',
  'storage.notConfigured':
    'Object storage is not configured; local storage only.',
  'storage.cached.headline':
    'The gallery may still look fine right now, but that is the cache.',
  'storage.cached.body':
    '{count} photo(s) still point at the CDN, but the files are gone from the bucket; the browser and CDN are serving a previously cached copy. Once the cache expires (derivatives are cached for a year) those images break. “Sync now” restores them immediately.',
  'storage.connectionError': 'Could not connect to object storage: {message}',
  'storage.switchFailed': 'Could not switch the image source.',
  'storage.switchedToRemote':
    'Image source switched to object storage. Refresh the home page to see images served from the CDN.',
  'storage.switchedToLocal':
    'Image source switched to local. Refresh the home page to see images served locally.',

  'theme.dark': 'Dark theme',
  'theme.light': 'Light theme',
  'theme.aria': 'Currently {current}; switch to {target}',
  'theme.title': 'Current: {current} (switch to {target})',

  'locale.switch': 'Switch language',
  'locale.aria': 'Current language: {current}; switch to {target}',
  'locale.title': 'Current: {current} (switch to {target})',
  'locale.zh': '简体中文',
  'locale.en': 'English',

  'version.title': 'Version of the running image: {version}',

  'gallery.home': 'Framefolio home',
  'gallery.settings': 'Gallery settings',
  'gallery.layoutAria': 'Currently the {current} layout; switch to {target}',
  'gallery.layoutTitle': 'Current: {current} (switch to {target})',
  'gallery.openPhoto': 'Open photo {filename}',
  'gallery.loading': 'Loading photos',
  'gallery.loadFailed': 'Could not load photos',
  'gallery.reload': 'Reload',
  'gallery.empty': 'No photos yet',
  'viewer.dialog': 'Photo viewer',
  'viewer.close': 'Close the photo viewer',
  'viewer.closeShort': 'Close',
  'viewer.previous': 'Previous photo',
  'viewer.previousShort': 'Previous',
  'viewer.next': 'Next photo',
  'viewer.nextShort': 'Next',
  'viewer.metadata': 'Photo information',

  'local.unknown': 'That did not work. Please try again.',
  'error.auth-required': 'Your session has expired. Please sign in again.',
  'error.missing-admin-header':
    'The request was missing its admin header. Refresh the page and try again.',
  'error.invalid-filename': 'Invalid file name.',
  'error.missing-request-body': 'The request body was empty.',
  'error.empty-upload': 'The uploaded file is empty.',
  'error.upload-unsupported-type': 'Unsupported file type “{extension}”.',
  'error.upload-not-an-image': 'The file is not a recognisable image.',
  'error.upload-extension-mismatch':
    'The file contents ({format}) do not match its extension ({extension}).',
  'error.upload-dimensions-unreadable': 'Could not read the image dimensions.',
  'error.upload-too-many-pixels':
    'The image is {width}×{height} ({pixels}), which exceeds the {limit} limit.',
  'error.upload-too-large': 'The upload exceeds the {limitMb} MB limit.',
  'error.photo-not-found': 'Photo not found.',
  'error.trash-cross-device':
    'The trash directory is on a different filesystem; move it next to originals.',
  'error.storage-source-invalid': 'The source must be "local" or "r2".',
  'error.storage-source-unconfigured':
    'Object storage is not configured. Set the FRAMEFOLIO_S3_* variables first.',
  'error.login-throttled': 'Too many failed attempts. Try again later.',
  'error.login-invalid-password': 'Invalid password.',
  'error.sync-already-running': 'A gallery sync is already running.'
}
