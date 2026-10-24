import { defineEventHandler } from 'h3'
import { authenticated, mutationGuard } from '../[...].js'
import { store } from '../../utils/store.js'
import { buildAssistantContext } from '../../utils/assistant-context.js'
import { assistantBody, assistantChat, assistantEnvironment, assistantLimit, assistantPrivate, validateChat } from '../../utils/assistant.js'
export default defineEventHandler(async event => {
  assistantPrivate(event)
  const userId = await store(data => authenticated(data, event).id)
  mutationGuard(event)
  assistantLimit(userId)
  const input = await assistantBody(event)
  validateChat(input)
  // Reauthenticate after body reading, then project under the store lock. Never
  // hold that lock across an external request or send the provider the raw user.
  const context = await store(data => buildAssistantContext(data, authenticated(data, event), input))
  return assistantChat(input, context.profile, await assistantEnvironment(event), context)
})
