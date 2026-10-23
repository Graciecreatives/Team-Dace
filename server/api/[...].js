import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createError, defineEventHandler, deleteCookie, getCookie, getHeader, getRequestIP, getRequestURL, setCookie, setHeader } from 'h3'
import { store } from '../utils/store.js'

const derive = promisify(scrypt)
const cookieName = 'farmbuddy_session'
const lifetime = 7 * 24 * 60 * 60
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
const publicUser = ({ id, name, email, farmName, farmType }) => ({ id, name, email, farmName, farmType })
const publicRecord = ({ userId, ...record }) => record
const buckets = new Map()
let activeHashes = 0

function throttle(event) {
  const now = Date.now()
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key)
  const key = getRequestIP(event) || 'unknown'
  let bucket = buckets.get(key)
  if (!bucket) {
    if (buckets.size >= 10000) fail(429, 'Authentication temporarily busy')
    bucket = { count: 0, until: now + 15 * 60 * 1000 }
    buckets.set(key, bucket)
  }
  if (++bucket.count > 20) {
    setHeader(event, 'Retry-After', Math.ceil((bucket.until - now) / 1000))
    fail(429, 'Too many authentication attempts')
  }
}

async function passwordHash(password, salt) {
  if (activeHashes >= 4) fail(429, 'Authentication temporarily busy')
  activeHashes++
  try { return await derive(password, salt, 64, { N: 16384, r: 8, p: 1 }) }
  finally { activeHashes-- }
}

function mutationGuard(event) {
  const host = getHeader(event, 'host')
  if (!host || /[\s,/@\\]/.test(host)) fail(403, 'Invalid host')
  const origin = getHeader(event, 'origin')
  if (origin) {
    let parsed
    try { parsed = new URL(origin) } catch { fail(403, 'Invalid origin') }
    const expectedProtocol = cookieOptions.secure ? 'https:' : getRequestURL(event, { xForwardedHost: false, xForwardedProto: false }).protocol
    if (parsed.origin !== origin || parsed.host !== host || parsed.protocol !== expectedProtocol) fail(403, 'Cross-origin request denied')
  }
  if (getHeader(event, 'sec-fetch-site') === 'cross-site') fail(403, 'Cross-site request denied')
}

async function body(event) {
  if ((getHeader(event, 'content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'Expected application/json')
  if (Number(getHeader(event, 'content-length')) > 16384) fail(413, 'Request too large')
  const chunks = []
  let size = 0
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false })) {
    size += Buffer.byteLength(chunk)
    if (size > 16384) {
      event.node.req.resume()
      fail(413, 'Request too large')
    }
    chunks.push(Buffer.from(chunk))
  }
  let value
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail(400, 'Invalid JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Expected an object')
  return value
}

function text(value, label, max, optional = false) {
  if (value === undefined && optional) return ''
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(400, `Invalid ${label}`)
  return value.trim()
}
function credentials(input, registering) {
  const email = text(input.email, 'email', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Invalid email')
  const password = input.password
  if (typeof password !== 'string' || password.length > 256 || password.length < (registering ? 8 : 1)) fail(400, 'Invalid password (registration requires 8-256 characters)')
  return { email, password }
}
function token(event) {
  const value = getCookie(event, cookieName)
  return value && /^[a-f0-9]{64}$/.test(value) ? digest(value) : null
}
function authenticated(data, event) {
  const hash = token(event)
  const session = data.sessions.find(item => item.tokenHash === hash && item.expiresAt > Date.now())
  const user = session && data.users.find(item => item.id === session.userId)
  if (!user) fail(401, 'Authentication required')
  return user
}
function newSession(data, userId, event, rawToken) {
  data.sessions = data.sessions.filter(item => item.expiresAt > Date.now() && item.tokenHash !== token(event))
  const own = data.sessions.filter(item => item.userId === userId)
  if (own.length >= 10) {
    const remove = new Set(own.slice(0, own.length - 9).map(item => item.tokenHash))
    data.sessions = data.sessions.filter(item => !remove.has(item.tokenHash))
  }
  data.sessions.push({ userId, tokenHash: digest(rawToken), expiresAt: Date.now() + lifetime * 1000 })
}

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const path = getRequestURL(event).pathname.replace(/\/$/, '')
  const method = event.method
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) mutationGuard(event)

  if (method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(path)) {
    throttle(event)
    const input = await body(event)
    const registering = path.endsWith('/register')
    const { email, password } = credentials(input, registering)
    const rawToken = randomBytes(32).toString('hex')
    let user
    if (registering) {
      const name = text(input.name, 'name', 100)
      const farmName = text(input.farmName, 'farmName', 150, true)
      const farmType = text(input.farmType, 'farmType', 100, true)
      const salt = randomBytes(16).toString('hex')
      const hash = (await passwordHash(password, salt)).toString('hex')
      user = await store(data => {
        if (data.users.some(item => item.email === email)) fail(409, 'Email already registered')
        const created = { id: randomUUID(), name, email, farmName, farmType, salt, passwordHash: hash }
        data.users.push(created)
        newSession(data, created.id, event, rawToken)
        return publicUser(created)
      }, true)
    } else {
      const found = await store(data => data.users.find(item => item.email === email))
      const hash = await passwordHash(password, found?.salt || '00000000000000000000000000000000')
      if (!found || !timingSafeEqual(hash, Buffer.from(found.passwordHash, 'hex'))) fail(401, 'Invalid email or password')
      user = await store(data => {
        newSession(data, found.id, event, rawToken)
        return publicUser(found)
      }, true)
    }
    setCookie(event, cookieName, rawToken, { ...cookieOptions, maxAge: lifetime })
    return { user }
  }
  if (method === 'GET' && path === '/api/auth/me') {
    return store(data => ({ user: publicUser(authenticated(data, event)) }))
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    await store(data => { data.sessions = data.sessions.filter(item => item.tokenHash !== token(event) && item.expiresAt > Date.now()) }, true)
    deleteCookie(event, cookieName, cookieOptions)
    return { ok: true }
  }
  if (method === 'GET' && path === '/api/farm') {
    return store(data => {
      const user = authenticated(data, event)
      return { records: data.records.filter(item => item.userId === user.id).map(publicRecord), reminders: data.reminders.filter(item => item.userId === user.id).map(publicRecord) }
    })
  }
  const recordDelete = path.match(/^\/api\/farm\/records\/([a-f0-9-]{36})$/)
  const reminderPatch = path.match(/^\/api\/farm\/reminders\/([a-f0-9-]{36})$/)
  if ((method === 'POST' && ['/api/farm/records', '/api/farm/reminders'].includes(path)) || (method === 'DELETE' && recordDelete) || (method === 'PATCH' && reminderPatch)) {
    // Authenticate before accepting potentially expensive or malformed bodies.
    await store(data => authenticated(data, event))
    const input = method === 'DELETE' ? {} : await body(event)
    return store(data => {
      const user = authenticated(data, event)
      if (method === 'DELETE') {
        const index = data.records.findIndex(item => item.id === recordDelete[1] && item.userId === user.id)
        if (index < 0) fail(404, 'Record not found')
        data.records.splice(index, 1)
        return { ok: true }
      }
      if (method === 'PATCH') {
        if (typeof input.completed !== 'boolean') fail(400, 'Invalid completed')
        const reminder = data.reminders.find(item => item.id === reminderPatch[1] && item.userId === user.id)
        if (!reminder) fail(404, 'Reminder not found')
        reminder.completed = input.completed
        return { reminder: publicRecord(reminder) }
      }
      const title = text(input.title, 'title', 200)
      if (path.endsWith('/records')) {
        if (!['income', 'expense', 'activity'].includes(input.category)) fail(400, 'Invalid category')
        const amount = input.amount === undefined ? null : input.amount
        if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1e12)) fail(400, 'Invalid amount')
        if (input.amount === null) fail(400, 'Invalid amount')
        const note = text(input.note, 'note', 2000, true)
        const record = { id: randomUUID(), userId: user.id, title, category: input.category, amount, note, createdAt: new Date().toISOString() }
        data.records.push(record)
        return { record: publicRecord(record) }
      }
      const date = text(input.date, 'date', 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date.startsWith('0000')) fail(400, 'Invalid date (expected YYYY-MM-DD)')
      const reminder = { id: randomUUID(), userId: user.id, title, date, completed: false }
      data.reminders.push(reminder)
      return { reminder: publicRecord(reminder) }
    }, true)
  }
  fail(404, 'API endpoint not found')
})
