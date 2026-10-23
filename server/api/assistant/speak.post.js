import { defineEventHandler, setHeader } from 'h3'
import { authenticated, mutationGuard } from '../[...].js'
import { store } from '../../utils/store.js'
import { assistantBody, assistantSpeak, assistantLimit, assistantPrivate } from '../../utils/assistant.js'
export default defineEventHandler(async event => {
  assistantPrivate(event)
  const user = await store(data => authenticated(data, event))
  mutationGuard(event)
  assistantLimit(user.id)
  const audio = await assistantSpeak(await assistantBody(event, 24000))
  setHeader(event, 'Content-Type', 'audio/mpeg')
  return audio
})
