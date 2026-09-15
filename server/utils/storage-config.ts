/**
 * Storage configuration, read from the environment at request time.
 *
 * Environment names follow the documented `FRAMEFOLIO_*` scheme rather than
 * Nuxt's `NUXT_*` convention, so Compose files use one consistent prefix.
 */

import {
  parseStorageSource,
  type StorageSource
} from '../../shared/node/photo-url'

export const STORAGE_SOURCE_ENV = 'FRAMEFOLIO_STORAGE_SOURCE'
export const S3_ENDPOINT_ENV = 'FRAMEFOLIO_S3_ENDPOINT'
export const S3_REGION_ENV = 'FRAMEFOLIO_S3_REGION'
export const S3_BUCKET_ENV = 'FRAMEFOLIO_S3_BUCKET'
export const S3_ACCESS_KEY_ENV = 'FRAMEFOLIO_S3_ACCESS_KEY_ID'
export const S3_SECRET_KEY_ENV = 'FRAMEFOLIO_S3_SECRET_ACCESS_KEY'
export const S3_PUBLIC_BASE_URL_ENV = 'FRAMEFOLIO_S3_PUBLIC_BASE_URL'
export const S3_PREFIX_ENV = 'FRAMEFOLIO_S3_PREFIX'

export interface StorageConfig {
  source: StorageSource
  endpoint: string | undefined
  region: string
  bucket: string | undefined
  accessKeyId: string | undefined
  secretAccessKey: string | undefined
  publicBaseUrl: string | undefined
  prefix: string | undefined
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
    prefix: normalize(environment[S3_PREFIX_ENV])
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
