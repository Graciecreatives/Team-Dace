import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { store } from '../../utils/store.js'
import { farmSlug, publicCatalog } from '../../utils/marketplace.js'
export default defineEventHandler(event => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  const slug = farmSlug(getRouterParam(event, 'slug'))
  return store(data => publicCatalog(data, slug))
})
