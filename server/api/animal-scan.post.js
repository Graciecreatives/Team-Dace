import { defineEventHandler } from 'h3'
import { authenticated, mutationGuard } from './[...].js'
import { store } from '../utils/store.js'
import { assistantBody, assistantLimit, assistantPrivate } from '../utils/assistant.js'
import { scanAnimal } from '../utils/animal-vision.js'

export default defineEventHandler(async event => {
  assistantPrivate(event)
  const userId = await store(data => authenticated(data, event).id)
  mutationGuard(event)
  assistantLimit(userId)
  const input = await assistantBody(event, 4 * 1024 * 1024 + 100)
  await store(data => authenticated(data, event))
  return scanAnimal(input)
})
