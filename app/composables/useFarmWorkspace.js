import { offlineActions, readWorkspace, writeWorkspace, workspaceKey, enqueueCommand, replayCommands, newCommandId } from '~/utils/offline-workspace.js'

export function useFarmWorkspace(user) {
  const state = ref(null), farmId = ref(''), busy = ref(false), error = ref(''), message = ref('')
  const queue = ref([]), enabled = ref(false), stale = ref(false), online = ref(true), uncertain = ref(null)
  let generation = 0, mounted = false, controller
  const identity = computed(() => user.value?.id || '')
  function persist() {
    if (!enabled.value) return true
    try {
      const cache = state.value ? { ...state.value, result: undefined } : null
      writeWorkspace(window.localStorage, identity.value, farmId.value, { queue: queue.value, cache })
      return true
    } catch (cause) { error.value = `${cause.message}. Keep this page open and copy important drafts.`; return false }
  }
  function apply(response) {
    state.value = response
    farmId.value = response.farm.id
    stale.value = false
    persist()
  }
  async function load() {
    if (!identity.value || busy.value) return
    const current = generation
    busy.value = true; error.value = ''
    controller = new AbortController()
    try {
      const response = await $fetch('/api/management', { query: { farmId: farmId.value || identity.value }, signal: controller.signal, timeout: 15000, retry: 0 })
      if (current === generation && mounted) apply(response)
    } catch (cause) {
      if (current !== generation || !mounted) return
      if ([401, 403].includes(cause.statusCode || cause.status)) {
        state.value = null; stale.value = false
        if (enabled.value) {
          try { writeWorkspace(window.localStorage, identity.value, farmId.value, { queue: queue.value, cache: null }) } catch {}
          enabled.value = false
        }
      }
      error.value = cause.data?.statusMessage || 'Cannot refresh farm workspace. Reconnect and try again.'
    } finally { if (current === generation) busy.value = false }
  }
  function reset() {
    generation++; controller?.abort(); busy.value = false
    state.value = null; queue.value = []; uncertain.value = null; error.value = ''; message.value = ''; stale.value = false; enabled.value = false
  }
  async function selectFarm(value) {
    if (busy.value || uncertain.value) { error.value = 'Resolve the pending request before switching farms.'; return }
    reset(); farmId.value = value
    // Device drafts are loaded only after fresh consent in this workspace.
    await load()
  }
  function enableDevice(value) {
    error.value = ''
    if (!value) {
      if (queue.value.length) { error.value = 'Sync or discard device drafts before disabling device storage.'; return }
      try { window.localStorage.removeItem(workspaceKey(identity.value, farmId.value)) } catch { error.value = 'Device storage could not be cleared. Keep this device private and try again.'; return }
      enabled.value = false
      return
    }
    try {
      const local = readWorkspace(window.localStorage, identity.value, farmId.value)
      queue.value = local.queue
      if (!state.value && local.cache) { state.value = local.cache; stale.value = true }
      enabled.value = true
      if (!persist()) enabled.value = false
    } catch (cause) { error.value = cause.message }
  }
  async function send(input) {
    return $fetch('/api/management', { method: 'POST', body: input, timeout: 15000, retry: 0 })
  }
  async function command(payload) {
    if (busy.value || !identity.value) return
    error.value = ''; message.value = ''
    if (uncertain.value) { error.value = 'Retry the unconfirmed request before making another change.'; return }
    const input = { ...payload, farmId: farmId.value || identity.value, commandId: newCommandId(crypto) }
    const canQueue = enabled.value && offlineActions.includes(input.action)
    if (!online.value && !canQueue) { error.value = 'This action needs a connection. Enable device drafts for offline observations, harvests and task updates.'; return }
    if (canQueue) {
      const previous = queue.value
      try {
        queue.value = enqueueCommand(previous, input)
        if (!persist()) { queue.value = previous; return }
      } catch (cause) { queue.value = previous; error.value = cause.message; return }
    }
    if (!online.value) { message.value = 'Draft saved on this device. Server stock and finances have not changed. Review and sync when online.'; return }
    const current = generation
    busy.value = true
    try {
      const response = await send(input)
      if (current !== generation || !mounted) return
      queue.value = queue.value.filter(row => row.commandId !== input.commandId)
      apply(response); message.value = 'Farm workspace updated.'
    } catch (cause) {
      if (current !== generation || !mounted) return
      const status = cause.statusCode || cause.status
      if (!canQueue && (!status || status >= 500)) uncertain.value = input
      error.value = cause.data?.statusMessage || (canQueue ? 'Save not confirmed. Draft kept with the same ID. Review and sync to safely retry.' : 'Save not confirmed. Retry the same request before making another change.')
    } finally { if (current === generation) busy.value = false }
  }
  async function sync() {
    if (busy.value || !online.value) return
    const current = generation
    busy.value = true; error.value = ''; message.value = ''
    try {
      if (uncertain.value) {
        const response = await send(uncertain.value)
        if (current !== generation || !mounted) return
        uncertain.value = null; apply(response)
      }
      await replayCommands(queue.value, send, () => current === generation && mounted, (id, response) => {
        queue.value = queue.value.filter(row => row.commandId !== id); apply(response)
      })
      if (current === generation && mounted) message.value = 'Pending changes confirmed by the server.'
    } catch (cause) {
      if (current === generation && mounted) error.value = cause.data?.statusMessage || 'Sync paused. Pending commands keep their IDs. Check permissions and available stock, then retry.'
    } finally { if (current === generation) busy.value = false }
  }
  function discard(id) { const previous = queue.value; queue.value = previous.filter(row => row.commandId !== id); if (!persist()) queue.value = previous }
  function connectivity() { online.value = navigator.onLine }
  watch(identity, () => { reset(); farmId.value = identity.value; if (mounted) load() }, { flush: 'sync' })
  onMounted(() => { mounted = true; farmId.value = identity.value; connectivity(); window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity); load() })
  onUnmounted(() => { mounted = false; generation++; controller?.abort(); window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity) })
  return { state, farmId, busy, error, message, queue, enabled, stale, online, uncertain, load, command, sync, selectFarm, enableDevice, discard }
}
