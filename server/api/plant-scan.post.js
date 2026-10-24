import { defineEventHandler } from 'h3'
import { authenticated, mutationGuard } from './[...].js'
import { store } from '../utils/store.js'
import { assistantBody, assistantLimit, assistantPrivate } from '../utils/assistant.js'
import { scanPlant } from '../utils/plant-vision.js'

export default defineEventHandler(async event => {
  assistantPrivate(event)
  const userId = await store(data => authenticated(data, event).id)
  mutationGuard(event)
  assistantLimit(userId)
  const input = await assistantBody(event, 4 * 1024 * 1024 + 4096)
  await store(data => authenticated(data, event))
  return scanPlant(input)
})
