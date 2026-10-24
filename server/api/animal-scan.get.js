import { defineEventHandler } from 'h3'
import { authenticated } from './[...].js'
import { store } from '../utils/store.js'
import { assistantPrivate } from '../utils/assistant.js'
import { animalVisionStatus } from '../utils/animal-vision.js'

export default defineEventHandler(async event => {
  assistantPrivate(event)
  await store(data => authenticated(data, event))
  return animalVisionStatus()
})
