import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

/**
 * S3-compatible object storage client.
 *
 * Cloudflare R2 is the target, but nothing here is R2-specific: the same code
 * talks to MinIO for local testing and to any other S3-compatible service.
 * Configuration is passed in rather than read from the environment so this stays
 * usable from both the sync child process and tests.
 */

export interface ObjectStorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Optional key prefix, for sharing one bucket between sites. */
  prefix?: string
  /**
   * Required for MinIO and most self-hosted S3 servers, which address buckets by
   * path (`host/bucket/key`) rather than by subdomain.
   */
  forcePathStyle?: boolean
}

export interface StoredObject {
  key: string
  size: number
  etag?: string
}

export const OBJECT_CONTENT_TYPE = 'image/webp'
/** Matches the local media route so CDN and local caching behave the same. */
export const OBJECT_CACHE_CONTROL =
  'public, max-age=31536000, immutable'

export function createObjectStorageClient(
  config: ObjectStorageConfig
): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  })
}

/** Apply the configured prefix to a storage key. */
export function toObjectKey(
  storageKey: string,
  prefix: string | undefined
): string {
  const normalized = prefix?.replace(/^\/+|\/+$/g, '')
  return normalized ? `${normalized}/${storageKey}` : storageKey
}

export interface PutObjectOptions {
  /** Absolute path of the file to upload. */
  filePath: string
  /** Storage key (bare filename). The prefix is applied internally. */
  storageKey: string
  contentType?: string
  cacheControl?: string
}

/**
 * Upload one file, streaming it from disk.
 *
 * Streaming matters: a preview can be several megabytes, and buffering each one
 * in memory would spike the memory use of the sync child process.
 */
export async function putFile(
  client: S3Client,
  config: ObjectStorageConfig,
  options: PutObjectOptions
): Promise<void> {
  const info = await stat(options.filePath)

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: toObjectKey(options.storageKey, config.prefix),
      Body: createReadStream(options.filePath),
      ContentLength: info.size,
      ContentType: options.contentType ?? OBJECT_CONTENT_TYPE,
      CacheControl: options.cacheControl ?? OBJECT_CACHE_CONTROL
    })
  )
}

/** Whether an object exists, without downloading it. */
export async function objectExists(
  client: S3Client,
  config: ObjectStorageConfig,
  storageKey: string
): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: toObjectKey(storageKey, config.prefix)
      })
    )
    return true
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return false
    }

    throw error
  }
}

export async function deleteObject(
  client: S3Client,
  config: ObjectStorageConfig,
  storageKey: string
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: toObjectKey(storageKey, config.prefix)
    })
  )
}

/**
 * List every object under the configured prefix.
 *
 * Used by the integrity report to find orphans (objects no longer referenced by
 * the index). Paginated because a large library will exceed one page.
 */
export async function listObjects(
  client: S3Client,
  config: ObjectStorageConfig
): Promise<StoredObject[]> {
  const prefix = config.prefix?.replace(/^\/+|\/+$/g, '')
  const objects: StoredObject[] = []
  let continuationToken: string | undefined

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ...(prefix ? { Prefix: `${prefix}/` } : {}),
        ...(continuationToken
          ? { ContinuationToken: continuationToken }
          : {})
      })
    )

    for (const item of page.Contents ?? []) {
      if (!item.Key) {
        continue
      }

      objects.push({
        // Report keys without the prefix so callers can compare them against
        // index storage keys directly.
        key: prefix ? item.Key.slice(prefix.length + 1) : item.Key,
        size: item.Size ?? 0,
        ...(item.ETag ? { etag: item.ETag } : {})
      })
    }

    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined
  } while (continuationToken)

  return objects
}

/** Verify credentials and bucket access; used by the admin connection test. */
export async function checkConnection(
  client: S3Client,
  config: ObjectStorageConfig
): Promise<void> {
  await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      MaxKeys: 1,
      ...(config.prefix
        ? { Prefix: `${config.prefix.replace(/^\/+|\/+$/g, '')}/` }
        : {})
    })
  )
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as {
    name?: unknown
    $metadata?: { httpStatusCode?: unknown }
  }

  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  )
}
