import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = read('pages/index.vue')
const components = ['FarmToolkit', 'GrowTogether', 'HowItWorks', 'ContactSection', 'SiteFooter', 'AppPreviews']
const sections = Object.fromEntries(components.map(name => [name, read(`components/${name}.vue`)]))
const allCopy = [page, ...Object.values(sections)].join('\n')

test('hero and metadata position FarmBuddy as a smart farming management system', () => {
  assert.match(page, /title: "FarmBuddy \| Smart Farming Management System"/)
  assert.match(page, /const heroHeadings = \[\s*"Smart Farming Management System"/)
  assert.match(page, /name: "description", content: ".*smart farming management system/)
  for (const term of ['crops', 'livestock', 'farm records', 'bookkeeping', 'inventory', 'team coordination', 'marketplace', 'AI support']) {
    assert.ok(page.toLowerCase().includes(term.toLowerCase()), `Missing management capability: ${term}`)
  }
})

test('all eight existing feature cards remain in order', () => {
  const features = page.match(/const features = \[([\s\S]*?)\n\];/)[1]
  assert.deepEqual([...features.matchAll(/title: "([^"]+)"/g)].map(match => match[1]), [
    'Photo Diagnosis', 'Voice Notes', 'Smart Questions', 'Farm Records',
    'Reminders', 'Farmer Network', 'Outbreak Alerts', 'Farm Passport',
  ])
  assert.match(page, /<FarmToolkit :features="features"/)
  assert.match(sections.FarmToolkit, /v-for="\(feature, index\) in features"/)
})

test('landing sections and existing destinations remain connected', () => {
  for (const id of ['home', 'about']) assert.ok(page.includes(`id="${id}"`))
  assert.match(sections.HowItWorks, /id="how-it-works"/)
  assert.match(sections.ContactSection, /id="contact"/)
  for (const name of components) assert.ok(page.includes(`<${name}`), `Missing section ${name}`)
  for (const id of ['home', 'about', 'how-it-works', 'contact']) assert.ok(sections.SiteFooter.includes(`/#${id}`))
  assert.match(page, /href="\/register"/)
  assert.match(page, /href="#about"/)
})

test('copy avoids unsupported promises and clearly marks the future passport', () => {
  assert.doesNotMatch(allCopy, /confidence level|expert backup|real expert help|verified farm record|start free|free to start|guaranteed diagnosis|diagnosis in minutes/i)
  assert.match(page, /Coming soon: a farm passport/)
  assert.match(sections.AppPreviews, /Farm passport · Coming soon/)
  assert.match(page, /not a confirmed diagnosis/)
  assert.match(sections.SiteFooter, /qualified vet or agronomist/)
})
