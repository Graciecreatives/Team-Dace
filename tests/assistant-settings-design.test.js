import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const sources = {}
for (const name of ['FarmAssistant', 'FarmSettings']) {
  const filename = `app/components/${name}.vue`
  const source = await readFile(filename, 'utf8')
  sources[name] = source
  test(`${name} script, template and scoped styles compile`, () => {
    const { descriptor, errors } = parse(source, { filename })
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: name })
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: name, compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
    for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: name, scoped: true }).errors, [])
    assert.match(source, /min-height:44px/)
    assert.match(source, /focus-visible/)
    assert.match(source, /prefers-reduced-motion/)
  })
}

function settings(fetcher = async () => ({ user: { farmName: 'Saved farm', farmType: 'crops' } }), callback = async () => {}) {
  const scope = Vue.effectScope()
  const props = Vue.reactive({ user: { id: 'owner', farmName: 'Green farm', farmType: 'poultry', mainEnterprises: ['Hens'], preferredLanguage: 'English' }, loggingOut: false, onProfileSaved: callback })
  const bindings = { ref: Vue.ref, reactive: Vue.reactive, watch: Vue.watch, nextTick: Vue.nextTick, defineProps: () => props, defineEmits: () => {}, $fetch: fetcher }
  const { descriptor } = parse(sources.FarmSettings)
  const setup = new Function(...Object.keys(bindings), descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\nreturn { form, saving, error, success, editorOpen, openEditor, closeEditor, save, editButton, editorHeading }')
  const vm = scope.run(() => setup(...Object.values(bindings)))
  return { vm, props, close: () => scope.stop() }
}

test('profile starts as overview, cancel discards drafts and restores focus', async () => {
  const f = settings()
  try {
    assert.equal(f.vm.editorOpen.value, false)
    let focus = 0
    f.vm.editButton.value = { focus: () => focus++ }
    await f.vm.openEditor()
    assert.equal(f.vm.form.farmType, 'livestock')
    f.vm.form.farmName = 'Unsaved'
    await f.vm.closeEditor()
    assert.equal(f.vm.editorOpen.value, false)
    assert.equal(f.vm.form.farmName, 'Green farm')
    assert.equal(focus, 1)
  } finally { f.close() }
})

test('profile save preserves API and callback contract, closes only after confirmed refresh', async () => {
  const calls = []
  const f = settings(async (...args) => { calls.push(args); return { user: { farmName: 'Saved farm' } } }, async user => calls.push(user))
  try {
    await f.vm.openEditor()
    await f.vm.save()
    assert.equal(calls[0][0], '/api/farm/profile')
    assert.equal(calls[0][1].method, 'PATCH')
    assert.equal(calls[0][1].body.onboardingCompleted, true)
    assert.equal(calls[1].farmName, 'Saved farm')
    assert.equal(f.vm.editorOpen.value, false)
    assert.match(f.vm.success.value, /saved/)
  } finally { f.close() }
})

test('failed refresh retains editor and distinguishes persisted changes from save failure', async () => {
  const f = settings(undefined, async () => { throw Error('refresh failed') })
  try {
    await f.vm.openEditor()
    await f.vm.save()
    assert.equal(f.vm.editorOpen.value, true)
    assert.match(f.vm.error.value, /changes were saved/)
    assert.equal(f.vm.saving.value, false)
    f.props.loggingOut = true
    f.vm.error.value = ''
    await f.vm.save()
    assert.equal(f.vm.error.value, '')
  } finally { f.close() }
})

test('assistant modes keep review, provider consent, status and cleanup safeguards', () => {
  const source = sources.FarmAssistant
  for (const label of ['Ask a question', 'Discuss a photo', 'Speak, review, then save', 'Connection details', 'Stop dictation']) assert.ok(source.includes(label))
  assert.match(source, /photoMode\.value = true/)
  assert.match(source, /status\.value\?\.chat && status\.value\?\.photo/)
  assert.match(source, /if \(!status\.value\?\.chat \|\| busy\.value \|\| speaking\.value \|\| dictationActive\.value/)
  assert.match(source, /image\.value && !status\.value\?\.photo/)
  assert.match(source, /Send shares this photo with Cloudflare Workers AI/)
  assert.doesNotMatch(source, /type="checkbox"/)
  assert.match(source, /:aria-pressed="includeFarmContext"/)
  assert.match(source, /generation !== sessionGeneration/)
  assert.match(source, /mode="voice" @records-changed="emit\('records-changed'\)"/)
  assert.match(source, /releaseDictation\(\)\s+clearAudio\(\)/)
  assert.match(source, /not guaranteed by this check/)
  assert.match(sources.FarmSettings, /<FarmServiceStatus :user-id="user.id \|\| ''"/)
})
