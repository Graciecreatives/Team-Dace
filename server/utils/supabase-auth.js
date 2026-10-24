import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { createError, getCookie, setCookie, deleteCookie, getRequestURL } from 'h3'

const resolved = new WeakMap()
const verified = new WeakMap()
const refreshing = new Map()
async function refreshSession(client, refreshToken) {
  const key = createHash('sha256').update(refreshToken).digest('hex')
  const now = Date.now()
  for (const [id, entry] of refreshing) if (entry.until < now) refreshing.delete(id)
  if (refreshing.has(key)) return refreshing.get(key).promise
  if (refreshing.size >= 1000) throw unavailable()
  const promise = providerCall(() => client.auth.refreshSession({ refresh_token: refreshToken }))
  const entry = { promise, until: now + 60000 }
  refreshing.set(key, entry)
  try {
    const result = await promise
    entry.until = Date.now() + 2000
    setTimeout(() => { if (refreshing.get(key) === entry) refreshing.delete(key) }, 2000).unref()
    return result
  } catch (error) { refreshing.delete(key); throw error }
}
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Authentication service unavailable' })
const denied = () => createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
export const authCookieNames = ['farmbuddy_access', 'farmbuddy_refresh']
const options = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
export function authConfig() {
  const url = process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  let validUrl = false
  try { const parsed = new URL(url); validUrl = !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash && (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) } catch {}
  // Service role credentials must never be used for end-user authentication.
  let privileged = key.startsWith('sb_secret_')
  try { privileged ||= JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role' } catch {}
  const requested = process.env.FARMBUDDY_AUTH
  const configured = Boolean(validUrl && key && !privileged && (!requested || ['local', 'supabase'].includes(requested)))
  const mode = requested === 'local' ? 'local' : requested === 'supabase' || (!requested && url && key) ? 'supabase' : requested ? 'supabase' : 'local'
  return { mode, configured, url, key }
}
export function clearAuthCookies(event) { for (const name of authCookieNames) deleteCookie(event, name, options()) }
export function writeAuthCookies(event, session) {
  if (!session?.access_token || !session?.refresh_token) throw unavailable()
  setCookie(event, authCookieNames[0], session.access_token, { ...options(), maxAge: 60 * 60 * 24 * 30 })
  setCookie(event, authCookieNames[1], session.refresh_token, { ...options(), maxAge: 60 * 60 * 24 * 30 })
}
export function confirmationRedirect() {
  if (!process.env.APP_URL) return undefined
  try {
    const url = new URL(process.env.APP_URL)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error()
    return new URL('/login', url).href
  } catch { throw createError({ statusCode: 503, statusMessage: 'Invalid application URL configuration' }) }
}
export function authClient(event) {
  const config = authConfig()
  if (!config.configured) throw unavailable()
  const fetcher = event.context.supabaseAuthFetch || globalThis.fetch
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init = {}) => {
      const timeout = AbortSignal.timeout(5000)
      return fetcher(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
    } },
  })
}
export async function providerCall(operation) {
  try {
    const result = await operation()
    if (result.error) {
      if (!result.error.status || result.error.status >= 500 || result.error.name === 'AuthRetryableFetchError') throw unavailable()
      throw denied()
    }
    return result.data
  } catch (error) {
    if (error.statusCode === 401 || error.statusCode === 503) throw error
    throw unavailable()
  }
}
export async function verifyUser(client, accessToken) {
  if (typeof accessToken !== 'string' || !accessToken) throw denied()
  const { user } = await providerCall(() => client.auth.getUser(accessToken))
  if (!user || typeof user.id !== 'string' || !user.id || typeof user.email !== 'string') throw denied()
  const display = (value, max) => typeof value === 'string' && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value) ? value.trim() : ''
  return { id: user.id, email: user.email.toLowerCase(), profile: { name: display(user.user_metadata?.name, 100), farmName: display(user.user_metadata?.farmName, 150), farmType: display(user.user_metadata?.farmType, 100) } }
}
export function verifiedIdentity(event) { return verified.get(event) || null }
export async function resolveSupabaseAuth(event) {
  const requestPath = getRequestURL(event).pathname
  if (requestPath.startsWith('/_nuxt/') || /\.(?:js|css|png|jpe?g|svg|ico|webp|woff2?|map)$/i.test(requestPath)) return
  if (resolved.has(event)) return resolved.get(event)
  const promise = (async () => {
    const config = authConfig()
    event.context.farmbuddyAuthMode = config.mode
    if (config.mode !== 'supabase') return
    // Config status remains available even for broken deployment configuration.
    if (getRequestURL(event).pathname.replace(/\/$/, '') === '/api/auth/config') return
    const path = getRequestURL(event).pathname.replace(/\/$/, '')
    // Logout must clear browser credentials even when deployment configuration is broken.
    if (path === '/api/auth/logout') return
    if (!config.configured) throw unavailable()
    if (['/api/auth/register', '/api/auth/login'].includes(path)) return
    const access = getCookie(event, authCookieNames[0])
    const refresh = getCookie(event, authCookieNames[1])
    if (!access && !refresh) return
    const client = authClient(event)
    let identity
    if (access) {
      try { identity = await verifyUser(client, access) }
      catch (error) { if (error.statusCode !== 401) throw error }
    }
    if (!identity && refresh) {
      try {
        const { session } = await refreshSession(client, refresh)
        identity = await verifyUser(client, session?.access_token)
        writeAuthCookies(event, session)
      } catch (error) {
        if (error.statusCode === 503) throw error
        clearAuthCookies(event)
        return
      }
    }
    if (identity) verified.set(event, identity)
    else clearAuthCookies(event)
  })()
  resolved.set(event, promise)
  return promise
}
export async function logoutSupabase(event) {
  try {
    const access = getCookie(event, authCookieNames[0])
    const refresh = getCookie(event, authCookieNames[1])
    if (refresh) refreshing.delete(createHash('sha256').update(refresh).digest('hex'))
    if (!access && !refresh) return
    const client = authClient(event)
    // setSession establishes only this request's SDK session before local-scope revocation.
    let session
    if (!access && refresh) {
      const result = await providerCall(() => client.auth.refreshSession({ refresh_token: refresh }))
      session = result.session
    } else {
      const result = await providerCall(() => client.auth.setSession({ access_token: access || '', refresh_token: refresh || '' }))
      session = result.session
    }
    if (!session) throw denied()
    await providerCall(() => client.auth.signOut({ scope: 'local' }))
  } finally { clearAuthCookies(event) }
}
