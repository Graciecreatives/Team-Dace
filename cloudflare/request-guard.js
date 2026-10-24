export async function boundedWorkerRequest(request) {
  if (['GET', 'HEAD'].includes(request.method) || !request.body) return request
  const path = new URL(request.url).pathname.replace(/\/$/, '')
  const limit = path === '/api/product-images' ? 8 * 1024 * 1024 : path.startsWith('/api/assistant/') ? 4 * 1024 * 1024 + 100000 : 16384
  const error = (status, statusMessage) => Response.json({ error: true, statusCode: status, statusMessage }, { status, headers: { 'Cache-Control': 'no-store' } })
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) return error(400, 'Invalid content length')
  if (Number(length) > limit) { await request.body.cancel().catch(() => {}); return error(413, 'Request too large') }
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel().catch(() => {}); return error(413, 'Request too large') }
      chunks.push(value)
    }
  } catch { return error(400, 'Could not read request body') }
  finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new Request(request, { body: bytes, duplex: 'half' })
}
