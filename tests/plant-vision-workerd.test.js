import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { rollup } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('production scanPlant uses workerd-compatible multipart fetch and rejects redirects without following them', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-plant-workerd-'))
  let bundle, mf
  try {
    const entry = join(dir, 'entry.js')
    const production = resolve('server/utils/plant-vision.js')
    const codec = resolve('server/utils/product-images.js')
    // Only the codec boundary is replaced. Production validation, fetch, catalogue
    // lookup and result normalization all execute inside the actual workerd runtime.
    bundle = await rollup({
      input: entry,
      external: id => id.startsWith('node:'),
      plugins: [
        { name: 'isolated-plant-worker', resolveId(id, importer) {
          if (id === entry) return entry
          if (importer === production && resolve(importer, '..', id) === codec) return '\0plant-photo-codec'
        }, load(id) {
          if (id === '\0plant-photo-codec') return `export async function encodeProductPhoto(bytes) { return { bytes, width: 2, height: 3 } }`
          if (id === entry) return `
            import { Buffer } from 'node:buffer'
            import { scanPlant } from ${JSON.stringify(production)}
            globalThis.Buffer = Buffer
            export default { async fetch(request, env) {
              process.env.PLANTNET_API_KEY = env.PLANTNET_API_KEY
              try { return Response.json(await scanPlant(await request.json())) }
              catch (error) { return Response.json({ message: error.statusMessage || error.message }, { status: error.statusCode || 500 }) }
            } }
          `
        } },
        nodeResolve({ preferBuiltins: true, exportConditions: ['workerd'] }),
        commonjs(),
      ],
    })
    const { output } = await bundle.generate({ format: 'esm', entryFileNames: 'worker.js' })
    const bytes = Buffer.alloc(33)
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
    bytes.write('IHDR', 12)
    bytes.writeUInt32BE(2, 16)
    bytes.writeUInt32BE(3, 20)
    const fakeKey = 'fake-workerd-test-key'
    const calls = []
    const reference = { author: 'Test contributor', license: 'cc-by-sa', citation: 'Test citation', organ: 'leaf', url: { m: 'https://bs.plantnet.org/image/m/abcdef1234', o: 'https://bs.plantnet.org/image/o/abcdef1234' } }
    const projected = { url: reference.url.m, author: reference.author, license: reference.license, citation: reference.citation, organ: reference.organ }
    const images = [{ ...reference, url: { m: 'https://bs.plantnet.org:443/image/m/abcdef' } }, { ...reference, author: '' }, reference]
    let redirectScan = false
    mf = new Miniflare(convertV4MiniflareOptions({
      compatibilityDate: '2026-10-24', compatibilityFlags: ['nodejs_compat'],
      modulesRoot: dir,
      modules: output.map(file => ({ type: 'ESModule', path: join(dir, file.fileName), contents: file.code })),
      bindings: { PLANTNET_API_KEY: fakeKey },
      outboundService: async request => {
        const url = new URL(request.url)
        calls.push(url.pathname)
        assert.equal(url.origin, 'https://my-api.plantnet.org', 'redirect destination must never be contacted')
        assert.equal(url.searchParams.get('api-key'), fakeKey)
        assert.equal(url.searchParams.get('lang'), 'en')
        if (url.pathname === '/v2/diseases') {
          assert.equal(request.method, 'GET')
          return Response.json([{ name: 'PHYTI', label: 'Late blight' }])
        }
        assert.ok(['/v2/identify/all', '/v2/diseases/identify'].includes(url.pathname))
        assert.equal(request.method, 'POST')
        assert.equal(url.searchParams.get('nb-results'), '3')
        assert.equal(url.searchParams.get('include-related-images'), 'true')
        assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/)
        const form = await request.formData()
        assert.deepEqual([...form.keys()], ['images', 'organs'])
        assert.deepEqual(form.getAll('organs'), ['leaf'])
        const image = form.get('images')
        assert.equal(image.name, 'plant.jpg')
        assert.equal(image.type, 'image/jpeg')
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes)
        if (redirectScan) return new Response(null, { status: 302, headers: { location: 'https://redirect.invalid/scan' } })
        return Response.json({ version: 'test-v1', results: url.pathname === '/v2/identify/all'
          ? [{ score: 0.95, images, species: { scientificNameWithoutAuthor: 'Solanum lycopersicum', commonNames: ['Tomato'] } }]
          : [{ score: 0.8, name: 'PHYTI', images }] })
      },
    }))
    const scan = task => mf.dispatchFetch('https://worker.test/scan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, image: `data:image/png;base64,${bytes.toString('base64')}`, organs: ['leaf'], consent: true }),
    })
    let response = await scan('identify')
    assert.equal(response.status, 200, await response.clone().text())
    let result = await response.json()
    assert.equal(result.status, 'suggestions')
    assert.equal(result.candidates[0].scientificName, 'Solanum lycopersicum')
    assert.equal(result.candidates[0].name, 'Tomato')
    assert.deepEqual(result.candidates[0].images, [projected])
    response = await scan('disease')
    assert.equal(response.status, 200, await response.clone().text())
    result = await response.json()
    assert.deepEqual(result.candidates, [{ name: 'Late blight', code: 'PHYTI', score: 0.8, images: [projected] }])
    assert.deepEqual(calls, ['/v2/identify/all', '/v2/diseases/identify', '/v2/diseases'])
    redirectScan = true
    for (const task of ['identify', 'disease']) {
      const before = calls.length
      response = await scan(task)
      assert.equal(response.status, 502, await response.clone().text())
      assert.match((await response.json()).message, /Pl@ntNet is unavailable/)
      assert.equal(calls.length, before + 1, '302 must not trigger a follow-up request')
    }
  } finally {
    try { await mf?.dispose(); await bundle?.close() } finally { await rm(dir, { recursive: true, force: true }) }
  }
})
