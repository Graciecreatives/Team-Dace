import { createError, getHeader } from 'h3'

export async function readBoundedBytes(event, limit, message = 'Request too large') {
  const reject = () => { throw createError({ statusCode: 413, statusMessage: message }) }
  if (Number(getHeader(event, 'content-length')) > limit) reject()
  // Nitro's Worker adapter has already materialized the bounded Request body.
  // Its mock IncomingMessage deliberately does not implement Readable.iterator.
  const raw = event.node.req.body
  if (raw !== undefined && raw !== null) {
    if (!(typeof raw === 'string' || raw instanceof Uint8Array)) throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    if (Buffer.byteLength(raw) > limit) reject()
    return Buffer.from(raw)
  }
  const chunks = []
  let size = 0
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false })) {
    size += Buffer.byteLength(chunk)
    if (size > limit) { event.node.req.resume(); reject() }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
