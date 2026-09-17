import {
  checkConnection,
  createObjectStorageClient,
  deleteObject,
  listObjects,
  objectExists,
  putFile,
  type ObjectStorageConfig,
  type StoredObject
} from './object-storage'
import type { RemotePublisher } from '../types/sync'

/**
 * Adapter between the sync pipeline's `RemotePublisher` interface and the
 * S3 client.
 *
 * Keeping this separate means the pipeline never imports the AWS SDK: it stays
 * testable with a fake publisher, and a missing or misconfigured object store
 * cannot break local-only operation.
 */
export function createRemotePublisher(
  config: ObjectStorageConfig & { generatedDirectory: string }
): RemotePublisher {
  const client = createObjectStorageClient(config)

  return {
    async upload(fileName, filePath) {
      await putFile(client, config, { filePath, storageKey: fileName })
    },
    async remove(fileName) {
      await deleteObject(client, config, fileName)
    },
    async list() {
      const objects = await listObjects(client, config)

      // Bare storage keys, which is what the index stores; `listObjects`
      // already strips the configured prefix.
      return objects.map(object => object.key)
    }
  }
}

export interface RemoteStorageReport {
  /** Objects present in the bucket under the configured prefix. */
  objects: StoredObject[]
  /** True when the credentials and bucket are usable. */
  connected: boolean
  /** Connection failure message, when `connected` is false. */
  message?: string
}

/** Test the connection and list what is stored. */
export async function inspectObjectStorage(
  config: ObjectStorageConfig
): Promise<RemoteStorageReport> {
  const client = createObjectStorageClient(config)

  try {
    await checkConnection(client, config)
  } catch (error: unknown) {
    return {
      objects: [],
      connected: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }

  try {
    return { objects: await listObjects(client, config), connected: true }
  } catch (error: unknown) {
    return {
      objects: [],
      connected: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export { createObjectStorageClient, objectExists }
