import { defineEventHandler, setHeader } from 'h3'
import { authenticated, mutationGuard, body, fail } from './[...].js'
import { store } from '../utils/store.js'
import { ownerCatalog, mutateCatalog } from '../utils/marketplace.js'
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (event.method === 'GET') return store(data => ownerCatalog(data, authenticated(data, event).id))
  if (event.method !== 'POST') fail(405, 'Method not allowed')
  mutationGuard(event)
  await store(data => authenticated(data, event))
  const input = await body(event)
  return store(data => mutateCatalog(data, authenticated(data, event).id, input), true)
})
