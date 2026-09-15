/**
 * Minimal S3-compatible server for tests.
 *
 * MinIO, which the plan designated for local verification, is archived and no
 * longer distributes binaries, and Docker is unavailable in this environment.
 * Rather than mock the AWS SDK (which would test nothing about signing, HTTP, or
 * XML parsing), this serves the handful of operations the app uses over real
 * HTTP, so the SDK client is exercised end to end.
 *
 * Supported: PutObject, HeadObject, DeleteObject, ListObjectsV2 (with the
 * `list-type=2`, `prefix`, `continuation-token`, and `max-keys` parameters).
 * Objects live in memory; this is a test fixture, not a storage product.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export interface FakeS3Options {
  /** Require this exact Authorization header prefix, to assert signing ran. */
  expectedAccessKey?: string
  /** Objects returned per page, to exercise pagination. */
  pageSize?: number
}

export interface FakeS3Server {
  endpoint: string
  port: number
  objects: Map<string, { body: Buffer; contentType?: string; cacheControl?: string }>
  /** Requests seen, for asserting the client sent what we expect. */
  requests: { method: string; path: string; query: Record<string, string> }[]
  /** Set to make every request return 500. */
  failAll: boolean
  close: () => Promise<void>
}

export async function startFakeS3(
  options: FakeS3Options = {}
): Promise<FakeS3Server> {
  const objects = new Map<
    string,
    { body: Buffer; contentType?: string; cacheControl?: string }
  >()
  const requests: { method: string; path: string; query: Record<string, string> }[] =
    []
  const pageSize = options.pageSize ?? 1000
  // Declared before the handler so the handler can consult `failAll`.
  const state = { failAll: false }

  const server = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const query = Object.fromEntries(url.searchParams.entries())
      requests.push({ method: request.method ?? '', path: url.pathname, query })

      if (state.failAll) {
        response.writeHead(500).end('simulated failure')
        return
      }

      if (options.expectedAccessKey) {
        const auth = request.headers.authorization ?? ''
        if (!auth.includes(options.expectedAccessKey)) {
          response.writeHead(403).end('bad credentials')
          return
        }
      }

      // Path-style addressing: /bucket/key...
      const segments = url.pathname.replace(/^\//, '').split('/')
      const bucket = decodeURIComponent(segments.shift() ?? '')
      const key = segments.map(decodeURIComponent).join('/')

      if (bucket.length === 0) {
        response.writeHead(400).end('missing bucket')
        return
      }

      const method = request.method ?? 'GET'

      if (method === 'PUT' && key.length > 0) {
        const raw = await readBody(request)
        // The AWS SDK streams uploads with `aws-chunked` framing plus a trailing
        // checksum. Real S3-compatible servers decode this, so the fixture must
        // too, otherwise it would not test what production actually receives.
        const body = headerValue(request, 'content-encoding')?.includes(
          'aws-chunked'
        )
          ? decodeAwsChunked(raw)
          : raw

        objects.set(key, {
          body,
          contentType: headerValue(request, 'content-type'),
          cacheControl: headerValue(request, 'cache-control')
        })
        response.writeHead(200, { ETag: `"${key.length}"` }).end()
        return
      }

      if (method === 'HEAD' && key.length > 0) {
        const object = objects.get(key)
        if (!object) {
          writeS3Error(response, 404, 'NoSuchKey')
          return
        }
        response
          .writeHead(200, {
            'content-length': String(object.body.length),
            'content-type': object.contentType ?? 'application/octet-stream'
          })
          .end()
        return
      }

      if (method === 'DELETE' && key.length > 0) {
        objects.delete(key)
        response.writeHead(204).end()
        return
      }

      if (method === 'GET' && query['list-type'] === '2') {
        const prefix = query.prefix ?? ''
        const all = [...objects.keys()]
          .filter(candidate => candidate.startsWith(prefix))
          .sort()

        const start = query['continuation-token']
          ? Number(query['continuation-token'])
          : 0
        const maxKeys = Math.min(
          Number(query['max-keys'] ?? pageSize) || pageSize,
          pageSize
        )
        const page = all.slice(start, start + maxKeys)
        const next = start + maxKeys

        response.writeHead(200, { 'content-type': 'application/xml' }).end(
          renderListBucketResult({
            bucket,
            prefix,
            keys: page,
            objects,
            truncated: next < all.length,
            nextToken: String(next)
          })
        )
        return
      }

      writeS3Error(response, 404, 'NoSuchBucket')
    }
  )

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const result: FakeS3Server & { failAll: boolean } = {
    endpoint: `http://127.0.0.1:${port}`,
    port,
    objects,
    requests,
    get failAll() {
      return state.failAll
    },
    set failAll(value: boolean) {
      state.failAll = value
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      )
  }

  return result
}

function renderListBucketResult(input: {
  bucket: string
  prefix: string
  keys: string[]
  objects: Map<string, { body: Buffer }>
  truncated: boolean
  nextToken: string
}): string {
  const contents = input.keys
    .map(
      key =>
        `<Contents><Key>${escapeXml(key)}</Key><Size>${input.objects.get(key)?.body.length ?? 0}</Size><ETag>"${key.length}"</ETag></Contents>`
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Name>${escapeXml(input.bucket)}</Name>
<Prefix>${escapeXml(input.prefix)}</Prefix>
<KeyCount>${input.keys.length}</KeyCount>
<MaxKeys>1000</MaxKeys>
<IsTruncated>${input.truncated}</IsTruncated>
${input.truncated ? `<NextContinuationToken>${escapeXml(input.nextToken)}</NextContinuationToken>` : ''}
${contents}
</ListBucketResult>`
}

function writeS3Error(
  response: ServerResponse,
  status: number,
  code: string
): void {
  response
    .writeHead(status, { 'content-type': 'application/xml' })
    .end(
      `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`
    )
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Strip `aws-chunked` framing.
 *
 * Format: repeated `<hex length>\r\n<data>\r\n`, terminated by `0\r\n`, then
 * trailer headers and a final CRLF.
 */
function decodeAwsChunked(input: Buffer): Buffer {
  const chunks: Buffer[] = []
  let offset = 0

  while (offset < input.length) {
    const lineEnd = input.indexOf('\r\n', offset)

    if (lineEnd === -1) {
      break
    }

    const sizeLine = input.subarray(offset, lineEnd).toString('ascii')
    // A trailer line (e.g. `x-amz-checksum-crc32:...`) has no valid hex size and
    // marks the end of the data chunks.
    const size = Number.parseInt(sizeLine.split(';')[0] ?? '', 16)

    if (!Number.isFinite(size) || Number.isNaN(size) || size === 0) {
      break
    }

    const dataStart = lineEnd + 2
    const dataEnd = dataStart + size

    if (dataEnd > input.length) {
      break
    }

    chunks.push(input.subarray(dataStart, dataEnd))
    offset = dataEnd + 2
  }

  return Buffer.concat(chunks)
}

function headerValue(
  request: IncomingMessage,
  name: string
): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
