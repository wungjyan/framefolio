import type {
  AdminDeleteResponse,
  AdminPhotosResponse,
  AdminSessionResponse,
  AdminSyncStartResponse,
  AdminSyncStatusResponse,
  AdminUploadResponse
} from '../../shared/types/admin'

/**
 * Header required on state-changing admin requests.
 *
 * The server rejects mutations without it. A cross-site form cannot set custom
 * headers, so this is CSRF defence in depth alongside the SameSite cookie.
 */
const ADMIN_REQUEST_HEADER = 'x-framefolio-admin'

export interface AdminApiError {
  statusCode: number
  message: string
}

/**
 * Thin wrapper around `$fetch` for the admin API.
 *
 * `credentials: 'include'` is required so the session cookie is sent; the admin
 * area lives on the same origin as the public gallery.
 */
export function useAdminApi() {
  async function request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
      body?: unknown
      headers?: Record<string, string>
      raw?: BodyInit
    } = {}
  ): Promise<T> {
    const method = options.method ?? 'GET'
    const isMutation = method !== 'GET'

    try {
      // Cast through `unknown`: Nitro's `$fetch` return type is derived from the
      // request path, which is not known statically here because the caller
      // supplies it. The admin endpoints are the only callers.
      return (await $fetch(path, {
        method,
        credentials: 'include',
        ...(options.body === undefined ? {} : { body: options.body }),
        ...(options.raw === undefined ? {} : { body: options.raw }),
        headers: {
          ...(isMutation ? { [ADMIN_REQUEST_HEADER]: '1' } : {}),
          ...(options.headers ?? {})
        }
      })) as T
    } catch (error: unknown) {
      throw toAdminApiError(error)
    }
  }

  return {
    /** Session state; safe to call before logging in. */
    getSession: () => request<AdminSessionResponse>('/api/admin/session'),

    login: (password: string) =>
      request<AdminSessionResponse>('/api/admin/session', {
        method: 'POST',
        body: { password },
        headers: { 'content-type': 'application/json' }
      }),

    logout: () =>
      request<AdminSessionResponse>('/api/admin/session', {
        method: 'DELETE'
      }),

    listPhotos: () => request<AdminPhotosResponse>('/api/admin/photos'),

    syncStatus: () => request<AdminSyncStatusResponse>('/api/admin/sync'),

    startSync: () =>
      request<AdminSyncStartResponse>('/api/admin/sync', { method: 'POST' }),

    deletePhoto: (filename: string) =>
      request<AdminDeleteResponse>(
        `/api/admin/photos/${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      ),

    /**
     * Upload one file as a raw streaming PUT.
     *
     * The raw `File` is sent as the body rather than multipart, because the
     * server streams it straight to disk; multipart would buffer the whole
     * image in memory first.
     */
    uploadPhoto: (file: File) =>
      request<AdminUploadResponse>(
        `/api/admin/photos/${encodeURIComponent(file.name)}`,
        {
          method: 'PUT',
          raw: file,
          headers: { 'content-type': file.type || 'application/octet-stream' }
        }
      )
  }
}

function toAdminApiError(error: unknown): AdminApiError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      statusCode?: unknown
      status?: unknown
      data?: { statusMessage?: unknown; message?: unknown }
      message?: unknown
    }

    const statusCode = Number(candidate.statusCode ?? candidate.status ?? 0)

    return {
      statusCode: Number.isFinite(statusCode) ? statusCode : 0,
      message:
        stringOrUndefined(candidate.data?.statusMessage) ??
        stringOrUndefined(candidate.data?.message) ??
        stringOrUndefined(candidate.message) ??
        'Request failed.'
    }
  }

  return { statusCode: 0, message: 'Request failed.' }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
