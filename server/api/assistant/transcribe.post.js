import { defineEventHandler } from 'h3'
import { authenticated, mutationGuard } from '../[...].js'
import { store } from '../../utils/store.js'
import { assistantBody, assistantEnvironment, assistantLimit, assistantPrivate } from '../../utils/assistant.js'
import { assistantTranscribe, MAX_TRANSCRIBE_BODY } from '../../utils/assistant-transcribe.js'

export default defineEventHandler(async event => {
  assistantPrivate(event)
  const userId = await store(data => authenticated(data, event).id)
  mutationGuard(event)
  assistantLimit(userId)
  const input = await assistantBody(event, MAX_TRANSCRIBE_BODY)
  // Body upload may outlive a session. Check again before spending AI quota.
  await store(data => authenticated(data, event))
  return assistantTranscribe(input, await assistantEnvironment(event))
})
