const DAY = 86400000
export const WAHIS_URL = 'https://wahis.woah.org/'
export const WOAH_FEED = 'https://www.woah.org/en/feed/'
const ISO2 = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '))
export function countryCode(value) {
  if (value === undefined) return null
  if (typeof value !== 'string' || !ISO2.has(value.toUpperCase())) throw new Error('countryCode must be an ISO 3166-1 alpha-2 code')
  return value.toUpperCase()
}
function text(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  }).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 500)
}
function recent(date, now) {
  const time = Date.parse(date)
  return Number.isFinite(time) && time <= now && time >= now - 90 * DAY
}
export function parseEppo(html, now = Date.now()) {
  const items = []
  let recognized = 0
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1])
    if (cells.length < 3) continue
    const link = cells[1].match(/<a\b[^>]*href\s*=\s*["'](\/reporting\/article-\d+)["'][^>]*>([\s\S]*?)<\/a>/i)
    const month = text(cells[2])
    if (!link || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}\/\d+$/.test(text(cells[0]))) continue
    recognized++
    // Month start is conservative: never promote an ambiguously old month into the window.
    if (!recent(`${month}-01T00:00:00Z`, now) || month > new Date(now).toISOString().slice(0, 7)) continue
    const title = text(link[2])
    if (!title) continue
    items.push({ id: `eppo:${link[1].split('-').pop()}`, title, kind: 'plants', source: 'EPPO Reporting Service', sourceUrl: `https://gd.eppo.int${link[1]}`, publishedAt: month, datePrecision: 'month', scope: 'country', summary: 'Country report, publication month only. Not confirmation of disease near your farm.' })
  }
  if (!recognized) throw new Error('EPPO reporting structure unavailable')
  return items.slice(0, 50)
}
export function parseWoah(xml, now = Date.now()) {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel>/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid WOAH feed')
  const items = []
  const field = (item, name) => item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || ''
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = text(field(match[1], 'title'))
    if (!/\b(disease|diseases|virus|influenza|fever|rabies|peste|bluetongue|anthrax|pox|infection|infections)\b/i.test(title)) continue
    let url
    try { url = new URL(text(field(match[1], 'link'))) } catch { continue }
    if (url.protocol !== 'https:' || url.hostname !== 'www.woah.org' || url.port || url.username || url.password || !url.pathname.startsWith('/en/')) continue
    const date = text(field(match[1], 'pubDate'))
    if (!recent(date, now)) continue
    items.push({ id: `woah:${url.pathname}`, title, kind: 'animals', source: 'WOAH', sourceUrl: url.href, publishedAt: new Date(date).toISOString().slice(0, 10), datePrecision: 'day', scope: 'global', summary: 'Global disease bulletin, not a local outbreak confirmation. Consult WAHIS and veterinary authorities.' })
  }
  return items.slice(0, 50)
}
export async function boundedFetch(url, fetcher = fetch, { maxBytes = 1048576, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let reader
  try {
    const response = await fetcher(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'text/html, application/rss+xml, application/xml' } })
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) throw new Error('Source unavailable or too large')
    reader = response.body.getReader()
    let size = 0
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('Source too large')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return new TextDecoder().decode(bytes)
  } finally {
    clearTimeout(timer)
    if (reader) await reader.cancel().catch(() => {})
  }
}
export async function healthBulletins(code, { now = Date.now(), fetcher = fetch } = {}) {
  const items = []
  const sources = []
  const jobs = [
    { name: 'EPPO Reporting Service', url: code ? `https://gd.eppo.int/country/${countryCode(code)}/reporting` : 'https://gd.eppo.int/', parser: parseEppo, enabled: Boolean(code), message: 'Country reports from the last 90 days, month precision. No reports does not mean safe.' },
    { name: 'WOAH', url: WOAH_FEED, parser: parseWoah, enabled: true, message: 'Global disease news only, not local outbreak notifications. Official outbreak reports: https://wahis.woah.org/' }
  ]
  await Promise.all(jobs.map(async job => {
    if (!job.enabled) { sources.push({ name: job.name, status: 'not-configured', url: job.url, message: 'Select a country to check country reporting. No local disease assessment is made.' }); return }
    try {
      items.push(...job.parser(await boundedFetch(job.url, fetcher), now))
      sources.push({ name: job.name, status: 'ok', url: job.url, message: job.message })
    } catch {
      sources.push({ name: job.name, status: 'unavailable', url: job.name === 'WOAH' ? WAHIS_URL : job.url, message: 'Official source unavailable or unrecognised. Check the authority directly. Missing reports do not imply safety.' })
    }
  }))
  sources.push({ name: 'Verified nearby alerts', status: 'not-configured', url: WAHIS_URL, message: 'No verified regional alert provider configured. Public bulletins do not confirm disease at your location.' })
  return { items: [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), sources, checkedAt: new Date(now).toISOString() }
}
