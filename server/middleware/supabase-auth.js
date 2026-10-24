import { defineEventHandler, getRequestURL } from 'h3'
import { resolveSupabaseAuth } from '../utils/supabase-auth.js'
import { mutationGuard } from '../api/[...].js'

export default defineEventHandler(async event => {
  if (getRequestURL(event).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(event.method)) mutationGuard(event)
  await resolveSupabaseAuth(event)
})
