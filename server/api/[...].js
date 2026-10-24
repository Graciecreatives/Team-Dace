import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createError, defineEventHandler, deleteCookie, getCookie, getHeader, getRequestIP, getRequestURL, setCookie, setHeader } from 'h3'
import { store } from '../utils/store.js'
import { authConfig, authClient, confirmationRedirect, providerCall, verifyUser, verifiedIdentity, resolveSupabaseAuth, writeAuthCookies, logoutSupabase } from '../utils/supabase-auth.js'

const derive = promisify(scrypt)
const cookieName = 'farmbuddy_session'
const lifetime = 7 * 24 * 60 * 60
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
const publicUser = ({ id, name, email, farmName, farmType, onboardingCompleted, location = '', mainEnterprises = '', preferredLanguage = '' }) => ({ id, name, email, farmName, farmType, onboardingCompleted: onboardingCompleted === true, location, mainEnterprises, preferredLanguage })
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
function profileText(value, label, max, optional = false) {
  const result = text(value, label, max, optional)
  if (typeof value === 'string' && /[<>\u0000-\u001f\u007f]/.test(value)) fail(400, `Invalid ${label} (plain text required)`)
  return result
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
  if (authConfig().mode === 'supabase') {
    const identity = verifiedIdentity(event)
    const user = identity && data.users.find(item => item.supabaseId === identity.id)
    if (!user) fail(401, 'Authentication required')
    return user
  }
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

const toolNames = { enterprises: 'enterprise', inventory: 'inventory', referrals: 'referral', notes: 'note' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function toolFields(collection, input, partial) {
  const schemas = {
    enterprises: { kind: ['crops', 'livestock'], name: 150, quantity: 'optionalNumber', unit: 60, startedOn: 'date', notes: 4000 },
    inventory: { name: 150, quantity: 'number', unit: 60, threshold: 'number', expiresOn: 'date', notes: 4000 },
    referrals: { title: 200, professionalType: ['agronomist', 'veterinarian'], summary: 6000, contact: 300, status: ['draft', 'contacted', 'resolved'] },
    notes: { title: 200, body: 10000 },
  }
  const schema = schemas[collection]
  if (Object.keys(input).some(key => !Object.hasOwn(schema, key) && !(collection === 'notes' && (key === 'id' || key === 'expectedUpdatedAt')))) fail(400, 'Unknown tool field')
  const result = {}
  for (const [key, rule] of Object.entries(schema)) {
    if (partial && input[key] === undefined) continue
    const optional = ['unit', 'notes', 'contact', 'startedOn', 'expiresOn', 'body'].includes(key)
    let value = input[key]
    if (Array.isArray(rule)) {
      if (key === 'status' && value === undefined) value = 'draft'
      if (!rule.includes(value)) fail(400, `Invalid ${key}`)
    } else if (rule === 'number' || rule === 'optionalNumber') {
      if (rule === 'optionalNumber' && (value === undefined || value === null)) value = null
      else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) fail(400, `Invalid ${key}`)
    } else if (rule === 'date') {
      value = text(value, key, 10, true)
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value.startsWith('0000'))) fail(400, `Invalid ${key}`)
    } else value = text(value, key, rule, optional)
    result[key] = value
  }
  if (collection === 'notes' && input.expectedUpdatedAt !== undefined && (typeof input.expectedUpdatedAt !== 'string' || input.expectedUpdatedAt.length > 40)) fail(400, 'Invalid expectedUpdatedAt')
  return result
}

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const path = getRequestURL(event).pathname.replace(/\/$/, '')
  const method = event.method
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) mutationGuard(event)
  await resolveSupabaseAuth(event)
  if (method === 'GET' && path === '/api/auth/config') {
    const { mode, configured } = authConfig()
    return { mode, configured }
  }

  if (method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(path)) {
    throttle(event)
    const input = await body(event)
    const registering = path.endsWith('/register')
    const { email, password } = credentials(input, registering)
    if (authConfig().mode === 'supabase') {
      const profile = registering ? {
        name: profileText(input.name, 'name', 100),
        farmName: profileText(input.farmName, 'farmName', 150, true),
        farmType: profileText(input.farmType, 'farmType', 100, true),
      } : null
      const client = authClient(event)
      const result = await providerCall(() => registering
        ? client.auth.signUp({ email, password, options: { data: profile, emailRedirectTo: confirmationRedirect() } })
        : client.auth.signInWithPassword({ email, password }))
      if (registering && !result.session) return { requiresEmailConfirmation: true, message: 'Check your email to confirm your account, then sign in.' }
      if (!result.session?.access_token) fail(401, 'Invalid email or password')
      const identity = await verifyUser(client, result.session.access_token)
      const user = await store(data => {
        const existing = data.users.find(item => item.supabaseId === identity.id)
        if (existing) return publicUser(existing)
        if (data.users.some(item => item.email.toLowerCase() === identity.email)) fail(409, 'Account migration required. Contact support.')
        const created = { id: randomUUID(), supabaseId: identity.id, email: identity.email, name: profile?.name ?? identity.profile.name, farmName: profile?.farmName ?? identity.profile.farmName, farmType: profile?.farmType ?? identity.profile.farmType, onboardingCompleted: false, location: '', mainEnterprises: '', preferredLanguage: '' }
        data.users.push(created)
        return publicUser(created)
      }, true)
      writeAuthCookies(event, result.session)
      return { user }
    }
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
        const created = { id: randomUUID(), name, email, farmName, farmType, onboardingCompleted: false, location: '', mainEnterprises: '', preferredLanguage: '', salt, passwordHash: hash }
        data.users.push(created)
        newSession(data, created.id, event, rawToken)
        return publicUser(created)
      }, true)
    } else {
      const found = await store(data => data.users.find(item => item.email === email))
      const hash = await passwordHash(password, found?.salt || '00000000000000000000000000000000')
      if (!found?.passwordHash || !found?.salt || !timingSafeEqual(hash, Buffer.from(found.passwordHash, 'hex'))) fail(401, 'Invalid email or password')
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
    if (authConfig().mode === 'supabase') {
      await logoutSupabase(event)
      deleteCookie(event, cookieName, cookieOptions)
      return { ok: true }
    }
    await store(data => { data.sessions = data.sessions.filter(item => item.tokenHash !== token(event) && item.expiresAt > Date.now()) }, true)
    deleteCookie(event, cookieName, cookieOptions)
    return { ok: true }
  }
  if (method === 'PATCH' && path === '/api/farm/profile') {
    await store(data => authenticated(data, event))
    const input = await body(event)
    const allowed = ['farmName', 'farmType', 'onboardingCompleted', 'location', 'mainEnterprises', 'preferredLanguage']
    if (Object.keys(input).some(key => !allowed.includes(key))) fail(400, 'Unknown profile field')
    if (input.onboardingCompleted !== true) fail(400, 'onboardingCompleted must be true')
    const farmName = profileText(input.farmName, 'farmName', 150)
    const farmType = input.farmType === 'poultry' ? 'livestock' : input.farmType
    if (!['crops', 'livestock', 'mixed'].includes(farmType)) fail(400, 'Invalid farmType')
    const optional = {}
    for (const [key, max] of [['location', 200], ['mainEnterprises', 500], ['preferredLanguage', 80]]) {
      if (input[key] !== undefined) optional[key] = profileText(input[key], key, max, true)
    }
    return store(data => {
      const user = authenticated(data, event)
      Object.assign(user, optional, { farmName, farmType, onboardingCompleted: true })
      return { user: publicUser(user) }
    }, true)
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
  if (method === 'GET' && path === '/api/tools') {
    return store(data => {
      const user = authenticated(data, event)
      return Object.fromEntries(Object.keys(toolNames).map(key => [key, data[key].filter(item => item.userId === user.id).map(publicRecord)]))
    })
  }
  const toolRoute = path.match(/^\/api\/tools\/(enterprises|inventory|referrals|notes)(?:\/([^/]+))?$/)
  if (toolRoute && ['POST', 'PATCH', 'DELETE'].includes(method)) {
    await store(data => authenticated(data, event))
    const [, collection, routeId] = toolRoute
    if ((method === 'POST' && routeId) || (method !== 'POST' && !routeId)) fail(404, 'API endpoint not found')
    if (routeId && !uuid.test(routeId)) fail(400, 'Invalid id')
    const input = method === 'DELETE' ? {} : await body(event)
    if (collection === 'notes' && method === 'POST' && (typeof input.id !== 'string' || !uuid.test(input.id))) fail(400, 'A client UUID id is required')
    if (method === 'PATCH' && input.id !== undefined) fail(400, 'Cannot change id')
    const fields = method === 'DELETE' ? {} : toolFields(collection, input, method === 'PATCH')
    return store(data => {
      const user = authenticated(data, event)
      const id = routeId || (collection === 'notes' ? input.id : randomUUID())
      const index = data[collection].findIndex(item => item.id === id && item.userId === user.id)
      if (method === 'POST') {
        if (index >= 0) return { [toolNames[collection]]: publicRecord(data[collection][index]) }
        const now = new Date().toISOString()
        const item = { ...fields, id, userId: user.id, createdAt: now, updatedAt: now }
        data[collection].push(item)
        return { [toolNames[collection]]: publicRecord(item) }
      }
      if (index < 0) fail(404, 'Item not found')
      if (method === 'DELETE') {
        data[collection].splice(index, 1)
        return { ok: true }
      }
      const item = data[collection][index]
      if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== item.updatedAt) fail(409, 'Note changed since last sync. Reload before editing.')
      Object.assign(item, fields, { updatedAt: new Date(Math.max(Date.now(), Date.parse(item.updatedAt) + 1)).toISOString() })
      return { [toolNames[collection]]: publicRecord(item) }
    }, true)
  }
  fail(404, 'API endpoint not found')
})

export { authenticated, mutationGuard, body, fail, publicUser }
