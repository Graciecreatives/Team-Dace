/**
 * Browser-only dictation lifecycle, with no upload or microphone access at creation.
 * start(): Promise<boolean> (false if busy, cancelled, unsupported, or failed).
 * stop(): finalize recording; stop while requesting permission cancels that request.
 * cancel(): discard recording, release resources, and invalidate pending permission.
 * onState receives permission | recording | processing | idle. onAudio receives a
 * nonempty Blob only after stop() or 60s. onError receives an Error.
 * Limits: 2,000,000 bytes, 60s recording, 15s permission, 3s finalization.
 * Inject timers and browser APIs for testing. Safe to construct during SSR.
 */
export function createChatRecorder({
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorder = globalThis.MediaRecorder,
  onState = () => {}, onAudio = () => {}, onError = () => {},
  setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout,
} = {}) {
  let current = null
  const release = stream => {
    for (const track of stream?.getTracks() || []) {
      try { track.stop() } catch { /* Continue releasing other tracks. */ }
    }
  }
  const clearTimers = session => {
    for (const timer of session.timers) clearTimeout(timer)
    session.timers.clear()
  }
  const later = (session, callback, delay) => {
    const timer = setTimeout(() => {
      session.timers.delete(timer)
      if (current === session) callback()
    }, delay)
    session.timers.add(timer)
  }
  const cleanup = session => {
    clearTimers(session)
    if (session.recorder) {
      session.recorder.ondataavailable = null
      session.recorder.onstop = null
      session.recorder.onerror = null
      try {
        if (session.recorder.state !== 'inactive') session.recorder.stop()
      } catch { /* Tracks still must be released. */ }
    }
    release(session.stream)
    session.stream = null
    session.chunks = []
    if (current === session) current = null
  }
  const fail = (session, error) => {
    if (current !== session) return
    cleanup(session)
    onState('idle')
    onError(error instanceof Error ? error : new Error('Audio recording failed'))
  }
  const cancel = () => {
    if (!current) return
    cleanup(current)
    onState('idle')
  }
  const stop = () => {
    const session = current
    if (!session) return
    if (!session.recorder) return cancel()
    if (session.finishing) return
    session.finishing = true
    clearTimers(session)
    onState('processing')
    later(session, () => fail(session, new Error('Audio finalization timed out')), 3000)
    try { session.recorder.stop() } catch (error) { fail(session, error) }
    // Do not wait for the stop event to release the microphone.
    release(session.stream)
    session.stream = null
  }
  const start = async () => {
    if (current) return false
    const session = { timers: new Set(), chunks: [], bytes: 0, finishing: false, stream: null, recorder: null }
    current = session
    onState('permission')
    later(session, () => fail(session, new Error('Microphone permission timed out')), 15000)
    try {
      if (!mediaDevices?.getUserMedia || !MediaRecorder) throw new Error('Audio recording is unavailable')
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported?.(type))
      if (!mimeType) throw new Error('No supported audio recording format')
      const stream = await mediaDevices.getUserMedia({ audio: true })
      if (current !== session) { release(stream); return false }
      session.stream = stream
      clearTimers(session)
      const recorder = new MediaRecorder(stream, { mimeType })
      session.recorder = recorder
      recorder.ondataavailable = event => {
        if (current !== session || !event.data?.size) return
        if (session.bytes + event.data.size > 2000000) {
          fail(session, new Error('Audio exceeds the 2 MB limit'))
          return
        }
        session.bytes += event.data.size
        session.chunks.push(event.data)
      }
      recorder.onerror = event => fail(session, event.error || new Error('Audio recording failed'))
      recorder.onstop = () => {
        if (current !== session) return
        if (!session.finishing) return fail(session, new Error('Audio recording stopped unexpectedly'))
        const blob = new Blob(session.chunks, { type: recorder.mimeType || mimeType })
        cleanup(session)
        onState('idle')
        if (blob.size) onAudio(blob)
        else onError(new Error('No audio was recorded'))
      }
      recorder.start(250)
      onState('recording')
      later(session, stop, 60000)
      return true
    } catch (error) {
      fail(session, error)
      return false
    }
  }
  return { start, stop, cancel }
}
