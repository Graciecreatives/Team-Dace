import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareProductPhoto, photoDimensions, MAX_PHONE_PHOTO_BYTES, MAX_UPLOAD_PHOTO_BYTES } from '../utils/product-photo.js'

function browser({ width = 4032, height = 3024, decodeError = false, noContext = false, encoded = new Blob(['clean-jpeg'], { type: 'image/jpeg' }), hold = false, onEncode } = {}) {
  const calls = []
  let image
  const context = {
    fillRect(...args) { calls.push(['fill', this.fillStyle, ...args]) },
    drawImage(...args) { calls.push(['draw', ...args.slice(1)]) },
  }
  const canvas = {
    width: 0, height: 0,
    getContext(type) { assert.equal(type, '2d'); return noContext ? null : context },
    toBlob(callback, type, quality) { calls.push(['encode', type, quality, this.width, this.height]); onEncode?.(); queueMicrotask(() => callback(encoded)) },
  }
  const platform = {
    Image: class {
      naturalWidth = width
      naturalHeight = height
      constructor() { image = this }
      set src(value) {
        calls.push(['src', value])
        if (value && !hold) queueMicrotask(() => decodeError ? this.onerror?.() : this.onload?.())
      }
    },
    URL: { createObjectURL(file) { calls.push(['url', file]); return 'blob:private-phone-photo' }, revokeObjectURL(url) { calls.push(['revoke', url]) } },
    document: { createElement(type) { assert.equal(type, 'canvas'); return canvas } },
  }
  return { platform, calls, canvas, get image() { return image } }
}
const photo = (type = 'image/jpeg', size = 5000000) => ({ type, size })

test('12MP gallery/camera photo is reduced to 1600px JPEG with a white canvas', async () => {
  const fixture = browser()
  const result = await prepareProductPhoto(photo(), { platform: fixture.platform })
  assert.equal(result.type, 'image/jpeg')
  assert.deepEqual(fixture.calls.find(call => call[0] === 'fill'), ['fill', '#ffffff', 0, 0, 1600, 1200])
  assert.deepEqual(fixture.calls.find(call => call[0] === 'draw'), ['draw', 0, 0, 1600, 1200])
  assert.deepEqual(fixture.calls.find(call => call[0] === 'encode'), ['encode', 'image/jpeg', 0.85, 1600, 1200])
  assert.ok(1600 * 1200 < 4000000)
  assert.deepEqual(fixture.calls.at(-2), ['revoke', 'blob:private-phone-photo'])
  assert.equal(fixture.canvas.width, 0)
  assert.equal(fixture.canvas.height, 0)
})
test('portrait orientation, small images, panorama and rounding stay bounded without enlargement', () => {
  for (const [w, h, expected] of [[3024,4032,{width:1200,height:1600}], [40,30,{width:40,height:30}], [10000,100,{width:1600,height:16}], [1601,1600,{width:1600,height:1599}]]) assert.deepEqual(photoDimensions(w,h), expected)
  for (const [w,h] of [[0,1], [-1,2], [1.5,2], [NaN,2], [10000,10000]]) assert.throws(() => photoDimensions(w,h), /40 megapixels/)
})
test('invalid source types and source size fail before browser decoding', async () => {
  const fixture = browser()
  await assert.rejects(prepareProductPhoto(photo('image/heic'), { platform: fixture.platform }), /HEIC/)
  await assert.rejects(prepareProductPhoto(photo('image/jpeg', MAX_PHONE_PHOTO_BYTES+1), { platform: fixture.platform }), /20 MB/)
  await assert.rejects(prepareProductPhoto(photo('image/png', 0), { platform: fixture.platform }), /20 MB/)
  assert.equal(fixture.calls.length, 0)
})
test('decoder, missing canvas, invalid output and oversize failures release object URLs', async () => {
  for (const options of [{ decodeError:true }, { noContext:true }, { width:10000,height:10000 }, { encoded:null }, { encoded:new Blob(['x'], { type:'image/png' }) }, { encoded:new Blob([new Uint8Array(MAX_UPLOAD_PHOTO_BYTES+1)], { type:'image/jpeg' }) }]) {
    const fixture = browser(options)
    await assert.rejects(prepareProductPhoto(photo('image/png'), { platform: fixture.platform }))
    assert.ok(fixture.calls.some(call => call[0] === 'revoke'))
    assert.equal(fixture.canvas.width, 0)
  }
})
test('account change or unmount cancellation stops preparation and releases resources', async () => {
  const controller = new AbortController()
  const fixture = browser({ hold:true })
  const pending = prepareProductPhoto(photo(), { signal:controller.signal, platform:fixture.platform })
  controller.abort()
  await assert.rejects(pending, error => error.name === 'AbortError')
  assert.ok(fixture.calls.some(call => call[0] === 'revoke'))
  assert.equal(fixture.image.onload, null)
  const early = browser()
  await assert.rejects(prepareProductPhoto(photo(), { signal:controller.signal, platform:early.platform }), error => error.name === 'AbortError')
  assert.equal(early.calls.length, 0)
  const later = new AbortController()
  const encoding = browser({ onEncode: () => later.abort() })
  await assert.rejects(prepareProductPhoto(photo(), { signal:later.signal, platform:encoding.platform }), error => error.name === 'AbortError')
  assert.equal(encoding.canvas.width, 0)
})
