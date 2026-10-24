import { defineEventHandler, getRequestURL } from 'h3'
import { mutationGuard } from '../api/[...].js'

// Apply same-origin protection to all API mutations, including specific routes.
export default defineEventHandler(event => {
  if (getRequestURL(event).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(event.method)) mutationGuard(event)
})
