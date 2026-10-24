import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

function registration(response) {
  const source = readFileSync(new URL('../pages/register.vue', import.meta.url), 'utf8')
  const block = source.slice(source.indexOf('async function submit()'), source.indexOf('</script>'))
  const ref = value => ({ value })
  const destinations = []
  const state = {
    loading: ref(false), setupRequired: ref(false), error: ref(''), confirmation: ref(''),
    name: ref('Farmer'), email: ref('farmer@example.test'), password: ref('temporary-password'), farmName: ref('Green Farm'), farmType: ref('crops'),
    confirmationBox: ref({ focus() { state.focused = true } }), errorBox: ref({ focus() {} }),
    nextTick: async () => {}, $fetch: async () => { state.calls = (state.calls || 0) + 1; return response },
    navigateTo: async path => destinations.push(path),
    destination: user => user.onboardingCompleted ? '/dashboard/crops' : '/onboarding',
  }
  return { submit: runInNewContext(`${block}\nsubmit`, state), state, destinations, source }
}

test('confirmation signup retains no password and never navigates into dashboard', async () => {
  const { submit, state, destinations, source } = registration({ requiresEmailConfirmation: true })
  await submit()
  assert.equal(state.password.value, '')
  assert.equal(state.loading.value, false)
  assert.match(state.confirmation.value, /confirm/)
  assert.equal(state.focused, true)
  assert.deepEqual(destinations, [])
  assert.match(source, /<form v-if="!confirmation"/)
})

test('authenticated registration navigates, invalid success payload does not', async () => {
  const success = registration({ user: { onboardingCompleted: false } })
  await success.submit()
  assert.deepEqual(success.destinations, ['/onboarding'])
  const malformed = registration({})
  await malformed.submit()
  assert.deepEqual(malformed.destinations, [])
  assert.match(malformed.state.error.value, /Unable to create/)
  assert.equal(malformed.state.loading.value, false)
})

test('incomplete Supabase setup prevents registration requests without discarding input', async () => {
  const form = registration({ user: { onboardingCompleted: false } })
  form.state.setupRequired.value = true
  await form.submit()
  assert.equal(form.state.calls || 0, 0)
  assert.equal(form.state.loading.value, false)
  assert.equal(form.state.password.value, 'temporary-password')
  assert.deepEqual(form.destinations, [])
})
