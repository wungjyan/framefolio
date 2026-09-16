/**
 * Storage configuration, read from the environment at request time.
 *
 * Environment names follow the documented `FRAMEFOLIO_*` scheme rather than
 * Nuxt's `NUXT_*` convention, so Compose files use one consistent prefix.
 */

import { parseStorageSource, type StorageSource } from './photo-url'
import type { ObjectStorageConfig } from './object-storage'

export const STORAGE_SOURCE_ENV = 'FRAMEFOLIO_STORAGE_SOURCE'
export const S3_ENDPOINT_ENV = 'FRAMEFOLIO_S3_ENDPOINT'
export const S3_REGION_ENV = 'FRAMEFOLIO_S3_REGION'
export const S3_BUCKET_ENV = 'FRAMEFOLIO_S3_BUCKET'
export const S3_ACCESS_KEY_ENV = 'FRAMEFOLIO_S3_ACCESS_KEY_ID'
export const S3_SECRET_KEY_ENV = 'FRAMEFOLIO_S3_SECRET_ACCESS_KEY'
export const S3_PUBLIC_BASE_URL_ENV = 'FRAMEFOLIO_S3_PUBLIC_BASE_URL'
export const S3_PREFIX_ENV = 'FRAMEFOLIO_S3_PREFIX'
export const S3_FORCE_PATH_STYLE_ENV = 'FRAMEFOLIO_S3_FORCE_PATH_STYLE'

export interface StorageConfig {
  source: StorageSource
  endpoint: string | undefined
  region: string
  bucket: string | undefined
  accessKeyId: string | undefined
  secretAccessKey: string | undefined
  publicBaseUrl: string | undefined
  prefix: string | undefined
  /** Path-style addressing; required by MinIO and most self-hosted servers. */
  forcePathStyle: boolean
}

const DEFAULT_REGION = 'auto'

export function resolveStorageConfig(
  environment: NodeJS.ProcessEnv = process.env
): StorageConfig {
  return {
    source: parseStorageSource(environment[STORAGE_SOURCE_ENV]),
    endpoint: normalizeUrl(environment[S3_ENDPOINT_ENV]),
    region: normalize(environment[S3_REGION_ENV]) ?? DEFAULT_REGION,
    bucket: normalize(environment[S3_BUCKET_ENV]),
    accessKeyId: normalize(environment[S3_ACCESS_KEY_ENV]),
    secretAccessKey: normalize(environment[S3_SECRET_KEY_ENV]),
    publicBaseUrl: normalizeUrl(environment[S3_PUBLIC_BASE_URL_ENV]),
    prefix: normalize(environment[S3_PREFIX_ENV]),
    forcePathStyle: isTruthy(environment[S3_FORCE_PATH_STYLE_ENV])
  }
}

/** Object storage is usable only when every required setting is present. */
export function isObjectStorageConfigured(config: StorageConfig): boolean {
  return (
    config.endpoint !== undefined &&
    config.bucket !== undefined &&
    config.accessKeyId !== undefined &&
    config.secretAccessKey !== undefined
  )
}

/**
 * Whether photo URLs should point at object storage.
 *
 * Falls back to local when object storage is selected but not configured, so a
 * half-finished R2 setup shows local images instead of a broken gallery.
 */
export function resolveEffectiveSource(config: StorageConfig): StorageSource {
  if (config.source === 'r2' && !isObjectStorageConfigured(config)) {
    return 'local'
  }

  return config.source
}

/**
 * Resolve which storage source is actually in effect.
 *
 * The runtime choice written by the admin UI wins over the environment default,
 * so switching sources needs no restart. This lives here, rather than being
 * repeated per endpoint, because having one caller read the persisted state and
 * another forget to is exactly how the admin status endpoint ended up reporting
 * a different source from the public API.
 */
export function resolveActiveSource(input: {
  storage: StorageConfig
  /** The persisted selection, if the admin UI has ever written one. */
  persisted?: StorageSource
}): { requested: StorageSource; effective: StorageSource } {
  const requested = input.persisted ?? input.storage.source

  return {
    requested,
    effective: resolveEffectiveSource({ ...input.storage, source: requested })
  }
}

/**
 * Build the S3 client configuration.
 *
 * Returns undefined unless object storage is fully configured, so callers treat
 * "not configured" and "incomplete" the same way: sync locally, no upload.
 */
export function toObjectStorageConfig(
  config: StorageConfig
): ObjectStorageConfig | undefined {
  if (!isObjectStorageConfigured(config)) {
    return undefined
  }

  return {
    endpoint: config.endpoint as string,
    region: config.region,
    bucket: config.bucket as string,
    accessKeyId: config.accessKeyId as string,
    secretAccessKey: config.secretAccessKey as string,
    ...(config.prefix ? { prefix: config.prefix } : {}),
    forcePathStyle: config.forcePathStyle
  }
}

function normalize(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeUrl(value: string | undefined): string | undefined {
  return normalize(value)
}

function isTruthy(value: string | undefined): boolean {
  const normalized = normalize(value)?.toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}
