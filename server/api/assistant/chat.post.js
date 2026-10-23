import { defineEventHandler } from 'h3'
import { authenticated, mutationGuard } from '../[...].js'
import { store } from '../../utils/store.js'
import { assistantBody, assistantChat, assistantLimit, assistantPrivate } from '../../utils/assistant.js'
export default defineEventHandler(async event => {
  assistantPrivate(event)
  const user = await store(data => authenticated(data, event))
  mutationGuard(event)
  assistantLimit(user.id)
  return assistantChat(await assistantBody(event), user)
})
