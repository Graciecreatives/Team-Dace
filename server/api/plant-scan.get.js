import { defineEventHandler } from 'h3'
import { authenticated } from './[...].js'
import { store } from '../utils/store.js'
import { assistantPrivate } from '../utils/assistant.js'
import { plantVisionStatus } from '../utils/plant-vision.js'

export default defineEventHandler(async event => {
  assistantPrivate(event)
  await store(data => authenticated(data, event))
  return plantVisionStatus()
})
