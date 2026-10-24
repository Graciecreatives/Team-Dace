import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedFetch, countryCode, healthBulletins, parseEppo, parseWoah } from '../server/utils/health-alerts.js'
const now = Date.parse('2026-10-24T00:00:00Z')
const row = (month, href = '/reporting/article-7786') => `<tr><td>2026/036</td><td><a href="${href}">Plant &amp; pest report</a></td><td>${month}</td></tr>`
const item = (date = 'Thu, 22 Oct 2026 11:57:09 +0000', link = 'https://www.woah.org/en/shamonda-virus/', title = 'Shamonda virus') => `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate></item>`
const rss = body => `<rss version="2.0"><channel>${body}</channel></rss>`
test('EPPO exact row fixture, conservative month age and future filtering', () => {
  const result = parseEppo(row('2026-10') + row('2024-02') + row('2026-11') + row('2026-07'), now)
  assert.equal(result.length, 1)
  assert.equal(result[0].publishedAt, '2026-10')
  assert.equal(result[0].datePrecision, 'month')
  assert.equal(result[0].scope, 'country')
  assert.equal(result[0].sourceUrl, 'https://gd.eppo.int/reporting/article-7786')
  assert.equal(result[0].title, 'Plant & pest report')
  assert.deepEqual(parseEppo(row('2024-02'), now), [])
})
test('EPPO changed pages and unsafe/nonarticle links fail unavailable', () => {
  for (const html of ['<html>blocked</html>', row('2026-10', 'https://evil.test/reporting/article-1'), row('2026-10', '/reporting/article-1?redirect=x'), row('2026-13')]) assert.throws(() => parseEppo(html, now))
})
test('WOAH accepts recent disease bulletins only with official HTTPS links', () => {
  const xml = rss(item() + item('2024-02-01') + item('2027-01-01') + item(undefined, 'http://www.woah.org/en/virus/') + item(undefined, 'https://www.woah.org.evil.test/en/virus/') + item(undefined, 'https://evil@www.woah.org/en/virus/') + item(undefined, undefined, 'Annual governance meeting'))
  const result = parseWoah(xml, now)
  assert.equal(result.length, 1)
  assert.equal(result[0].scope, 'global')
  assert.equal(result[0].publishedAt, '2026-10-22')
  assert.equal(result[0].datePrecision, 'day')
  assert.throws(() => parseWoah('<html>blocked</html>', now))
  assert.throws(() => parseWoah('<!DOCTYPE rss>' + rss(item()), now))
})
test('ISO2 validation does not permit paths or invented country codes', () => {
  assert.equal(countryCode('ng'), 'NG')
  assert.equal(countryCode(undefined), null)
  for (const value of ['ZZ', '../NG', 'Nigeria', null, {}, 'NG?x']) assert.throws(() => countryCode(value))
})
test('bounded fetch enforces streaming and declared byte limits, no redirects, timeout', async () => {
  await assert.rejects(boundedFetch('https://www.woah.org/en/feed/', async () => new Response('123456'), { maxBytes: 5 }))
  await assert.rejects(boundedFetch('https://www.woah.org/en/feed/', async () => new Response('x', { headers: { 'content-length': '999' } }), { maxBytes: 5 }))
  await assert.rejects(boundedFetch('https://www.woah.org/en/feed/', async () => new Response('', { status: 503 })))
  let options
  assert.equal(await boundedFetch('https://www.woah.org/en/feed/', async (_, opts) => { options = opts; return new Response('ok') }), 'ok')
  assert.equal(options.redirect, 'error')
  await assert.rejects(boundedFetch('https://www.woah.org/en/feed/', (_, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new Error('timeout')))), { timeoutMs: 5 }))
})
test('source failures are independent and requested coordinates never sent upstream', async () => {
  const urls = []
  const result = await healthBulletins('NG', { now, fetcher: async url => { urls.push(url); return url.includes('gd.eppo') ? new Response('blocked') : new Response(rss(item())) } })
  assert.equal(result.items.length, 1)
  assert.equal(result.sources.find(s => s.name.startsWith('EPPO')).status, 'unavailable')
  assert.equal(result.sources.find(s => s.name === 'WOAH').status, 'ok')
  assert.deepEqual(urls.sort(), ['https://gd.eppo.int/country/NG/reporting', 'https://www.woah.org/en/feed/'].sort())
  const failed = await healthBulletins(undefined, { now, fetcher: async () => { throw new Error('network') } })
  assert.deepEqual(failed.items, [])
  assert.equal(failed.sources.find(s => s.name === 'WOAH').url, 'https://wahis.woah.org/')
  assert.equal(failed.sources.find(s => s.name.startsWith('EPPO')).status, 'not-configured')
})
