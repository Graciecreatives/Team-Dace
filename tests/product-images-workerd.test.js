import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { rollup } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { unwasm } from 'unwasm/plugin'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import sharp from 'sharp'

test('Nitro-style raw-module WASM loader actually decodes, orients and resizes in workerd', { timeout: 60000 }, async () => {
  // Isolated bundle only, never touches the shared Nuxt .output or real accounts.
  const dir = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-image-workerd-'))
  let bundle, mf
  try {
    const loader = resolve('server/utils/product-photon.js')
    const images = resolve('server/utils/product-images.js')
    const entry = resolve(dir, 'entry.js')
    bundle = await rollup({
      input: entry,
      external: id => id.startsWith('node:') || id === 'cloudflare:workers',
      plugins: [
        { name: 'isolated-image-worker', resolveId(id) {
          if (id === entry) return entry
          if (id === '@cf-wasm/photon/node') return loader
        }, load(id) {
          if (id === entry) return `
            import { Buffer } from 'node:buffer'
            import { encodeProductPhoto } from ${JSON.stringify(images)}
            export default { async fetch(request) {
              try {
                const photo = await encodeProductPhoto(Buffer.from(await request.arrayBuffer()), request.headers.get('content-type'))
                return new Response(photo.bytes, { headers: { 'content-type': 'image/jpeg', 'x-width': String(photo.width), 'x-height': String(photo.height) } })
              } catch (error) { return new Response(error.message, { status: error.statusCode || 500 }) }
            } }
          `
        } },
        unwasm({ esmImport: true }),
        nodeResolve({ preferBuiltins: true, exportConditions: ['workerd'] }),
        commonjs(),
      ],
    })
    const { output } = await bundle.generate({ format: 'esm', entryFileNames: 'worker.js', chunkFileNames: 'chunks/[name].js' })
    const modules = output.map(file => file.type === 'chunk'
      ? { type: 'ESModule', path: join(dir, file.fileName), contents: file.code }
      : { type: 'CompiledWasm', path: join(dir, file.fileName), contents: file.source })
    assert.ok(output.some(file => file.type === 'asset' && file.fileName.endsWith('.wasm')))
    mf = new Miniflare(convertV4MiniflareOptions({
      compatibilityDate: '2026-10-24', compatibilityFlags: ['nodejs_compat'],
      modulesRoot: dir, modules,
      bindings: { FARMBUDDY_DATABASE: 'cloudflare', FARMBUDDY_IMAGE_STORAGE: 'cloudflare' },
    }))
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#066136' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer()
    let response = await mf.dispatchFetch('http://image.test/', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: original })
    assert.equal(response.status, 200, await response.clone().text())
    const result = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(result).metadata()
    assert.equal(metadata.width, 800)
    assert.equal(metadata.height, 1600)
    assert.equal(response.headers.get('x-width'), '800')
    assert.equal(metadata.format, 'jpeg')
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.orientation, undefined)
    assert.equal(metadata.icc, undefined)
    for (const format of ['png', 'webp']) {
      const bytes = await sharp({ create: { width: 40, height: 30, channels: 4, background: '#ffffff00' } })[format]().toBuffer()
      response = await mf.dispatchFetch('http://image.test/', { method: 'POST', headers: { 'content-type': `image/${format}` }, body: bytes })
      assert.equal(response.status, 200, await response.clone().text())
      const decoded = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
      assert.equal(decoded.width, 40)
      assert.equal(decoded.height, 30)
    }
  } finally {
    try { await mf?.dispose(); await bundle?.close() } finally { await rm(dir, { recursive: true, force: true }) }
  }
})
