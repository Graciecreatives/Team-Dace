import { defineEventHandler, getHeader, setHeader } from 'h3'
import { authenticated, mutationGuard, body, fail } from './[...].js'
import { store } from '../utils/store.js'
import { changeRoster, roster } from '../utils/farm-team.js'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (event.method === 'GET') return store(data => ({ members: roster(authenticated(data, event)) }))
  if (event.method !== 'POST') fail(405, 'Method not allowed')
  mutationGuard(event)
  // Require an explicit same-origin browser request, even if fetch metadata is absent.
  if (!getHeader(event, 'origin')) fail(403, 'Origin required')
  await store(data => authenticated(data, event))
  const input = await body(event)
  return store(data => changeRoster(authenticated(data, event), input), true)
})
