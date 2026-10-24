<script setup>
import { Users, UserPlus, Pencil, Trash2, RefreshCw, ShieldCheck, X } from 'lucide-vue-next'
const props = defineProps({ user: { type: Object, default: () => ({}) } })
const members = ref([])
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const feedback = ref('')
const editing = ref('')
const removing = ref('')
const search = ref('')
const composing = ref(false)
const editorElement = ref(null)
watch(composing, open => { if (open) nextTick(() => editorElement.value?.querySelector('input')?.focus()) })
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const blank = () => ({ name: '', contact: '', role: '', responsibilities: '', status: 'active' })
const draft = reactive(blank())
const owner = computed(() => props.user?.id || '')
const visible = computed(() => members.value.filter(m => `${m.name} ${m.role} ${m.responsibilities}`.toLowerCase().includes(search.value.toLowerCase())))
let generation = 0, mounted = false, controller
function clearDraft() { editing.value = ''; composing.value = false; Object.assign(draft, blank()) }
async function request(input) {
  if (!owner.value || busy.value) return
  const token = generation
  controller = new AbortController()
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    const result = await $fetch('/api/farm-team', { signal: controller.signal, ...(input ? { method: 'POST', body: input } : {}) })
    if (token !== generation || !mounted) return
    members.value = result.members; loaded.value = true
    if (input) { clearDraft(); removing.value = ''; feedback.value = input.action === 'remove' ? 'Member removed from your roster.' : 'Roster saved. No invitation or account access was created.' }
  } catch {
    if (token === generation && mounted) error.value = input ? 'Save was not confirmed. Your draft is kept. Refresh the roster before retrying to avoid duplicate entries.' : 'Could not load your team. Reconnect and try again.'
  } finally { if (token === generation) busy.value = false }
}
function resetOwner() {
  generation++; controller?.abort(); busy.value = false; loaded.value = false
  members.value = []; error.value = ''; feedback.value = ''; removing.value = ''; search.value = ''; clearDraft()
  if (mounted && owner.value) request()
}
function editMember(member) { composing.value = true; editing.value = member.id; removing.value = ''; Object.assign(draft, { name: member.name, contact: member.contact, role: member.role, responsibilities: member.responsibilities, status: member.status }) }
function save() { request({ ...draft, action: editing.value ? 'edit' : 'add', ...(editing.value ? { id: editing.value } : {}) }) }
watch(owner, resetOwner, { flush: 'sync' })
onMounted(() => { mounted = true; resetOwner() })
onUnmounted(() => { mounted = false; generation++; controller?.abort() })
</script>

<template>
  <section class="farm-team" aria-labelledby="team-title" :aria-busy="busy">
    <header class="team-header"><div class="title-group"><Users :size="32" aria-hidden="true" /><div><h2 id="team-title">People behind the harvest</h2><p>Your people, their roles, one shared season.</p></div></div><button type="button" :disabled="!owner || busy || !loaded || members.length >= 100" :aria-expanded="composing" aria-controls="team-editor" @click="composing = true"><UserPlus :size="18" aria-hidden="true" /> Add person</button></header>
    <p class="privacy"><strong>A private roster, not account access.</strong> Adding a person does not send an invitation or let them sign in to your farm. Only your signed-in account can manage this list. Save contact details only with permission.</p>
    <p v-if="!owner" class="notice">Sign in to manage your farm roster.</p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p><p role="status" aria-live="polite">{{ feedback }}</p>
    <div v-if="owner" class="team-layout">
      <form v-if="composing" id="team-editor" ref="editorElement" class="editor" @submit.prevent="save">
        <h3>{{ editing ? 'Edit roster member' : 'Add a helping hand' }}</h3><p>Record a person, their work and how to reach them.</p>
        <fieldset :disabled="busy || !loaded"><legend class="sr-only">Member details</legend>
          <label>Name <input v-model="draft.name" required maxlength="100" autocomplete="off" placeholder="e.g. Ada Okeke"></label>
          <label>Contact <span class="optional">optional</span><input v-model="draft.contact" maxlength="150" autocomplete="off" placeholder="Phone or email"></label>
          <label>Farm role <input v-model="draft.role" required maxlength="80" placeholder="e.g. Field supervisor"></label>
          <label>Responsibilities <span class="optional">optional</span><textarea v-model="draft.responsibilities" maxlength="600" rows="3" placeholder="Irrigation checks, harvest planning…" /></label>
          <label>Roster status <select v-model="draft.status"><option value="active">Active</option><option value="seasonal">Seasonal</option><option value="inactive">Inactive</option></select></label>
          <div class="actions"><button :disabled="!editing && members.length >= 100"><UserPlus :size="18" aria-hidden="true" />{{ busy ? 'Saving…' : editing ? 'Save changes' : 'Add to roster' }}</button><button type="button" class="secondary" @click="clearDraft"><X :size="18" aria-hidden="true" />Cancel</button></div>
        </fieldset>
      </form>
      <div class="roster"><div class="roster-heading"><div><h3>Team roster <span class="count">{{ members.length }} / 100</span></h3><p>Roles describe farm work, not account permissions.</p></div><button class="secondary" type="button" :disabled="busy" @click="request()"><RefreshCw :size="18" aria-hidden="true" />{{ busy ? 'Loading…' : 'Refresh' }}</button></div>
        <label>Find a team member<input v-model="search" type="search" placeholder="Search name, role or responsibility"></label>
        <p v-if="!loaded">{{ busy ? 'Loading your roster…' : 'Refresh to load your roster.' }}</p>
        <div v-else-if="!members.length" class="empty"><h3>Good work starts with good people.</h3><p>Add your first roster member to organise the season. No messages will be sent.</p></div>
        <p v-else-if="!visible.length">No members match your search.</p>
        <ul class="member-list"><li v-for="member in visible" :key="member.id"><div class="member-top"><span class="avatar" aria-hidden="true">{{ initials(member.name) }}</span><div class="identity"><h4>{{ member.name }}</h4><p class="role">{{ member.role }}</p></div><span class="status" :class="member.status">{{ member.status }}</span></div><p v-if="member.contact">{{ member.contact }}</p><p class="responsibilities">{{ member.responsibilities || 'No responsibilities recorded yet.' }}</p><p class="permission"><ShieldCheck :size="16" aria-hidden="true" />Roster only · No account access granted</p>
          <div v-if="removing === member.id" class="notice"><p>Remove {{ member.name }} from the roster? This cannot be undone. Their account access is not affected.</p><div class="actions"><button type="button" :disabled="busy" @click="request({ action: 'remove', id: member.id })">Confirm removal</button><button type="button" class="secondary" :disabled="busy" @click="removing = ''">Keep member</button></div></div>
          <div v-else class="actions"><button type="button" class="secondary" :disabled="busy" @click="editMember(member)"><Pencil :size="16" aria-hidden="true" />Edit <span class="sr-only">{{ member.name }}</span></button><button type="button" class="remove" :disabled="busy" @click="removing = member.id"><Trash2 :size="16" aria-hidden="true" />Remove <span class="sr-only">{{ member.name }}</span></button></div>
        </li></ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.farm-team{color:#233e2d;background:#f7f9f3;border:1px solid #dce5d5;border-radius:24px;padding:clamp(16px,3vw,32px)}.team-header,.member-top,.roster-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.eyebrow{font-size:.7rem;letter-spacing:.14em;font-weight:800;color:#647b41}.farm-team h2{font-size:clamp(1.6rem,4vw,2rem);font-weight:800}.farm-team h3,.farm-team h4{font-weight:750}.farm-team p{line-height:1.6;margin:8px 0}.count,.status{border-radius:30px;padding:6px 12px;background:#e4edd8;font-size:.8rem;font-weight:700}.privacy{background:#edf1e5;padding:16px;border-radius:14px}.notice{background:#fff1d5;padding:12px;border-radius:10px}.team-layout{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,1.6fr);gap:24px;margin-top:24px}.editor,.member-list li{padding:20px;background:#fff;border:1px solid #dce5d5;border-radius:16px}.editor{align-self:start}.farm-team fieldset{border:0;padding:0;min-width:0}.farm-team label{display:block;font-weight:650;font-size:.9rem;margin:16px 0}.optional{font-size:.75rem;color:#647361;font-weight:400}.farm-team input,.farm-team select,.farm-team textarea{display:block;width:100%;min-width:0;margin-top:6px;padding:11px;border:1px solid #9aaa94;border-radius:9px;background:#fff;color:#233e2d}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.farm-team button{background:#305d36;color:white;padding:10px 14px;min-height:44px;border:1px solid transparent;border-radius:9px;font-weight:650}.farm-team button.secondary{background:#fff;border-color:#a7b69c;color:#305d36}.farm-team button.remove{background:#fff;color:#933a27}.farm-team button:disabled{opacity:.5;cursor:not-allowed}.farm-team :focus-visible{outline:3px solid #b77a20;outline-offset:3px}.member-list{display:grid;gap:14px;padding:0;list-style:none}.member-list li{overflow-wrap:anywhere}.role{font-weight:650}.responsibilities{color:#5c6b57;white-space:pre-wrap}.status{text-transform:capitalize}.status.inactive{background:#eee;color:#555}.status.seasonal{background:#fff0c7;color:#77521c}.empty{padding:28px 16px;border:1px dashed #b4c3a9;border-radius:14px;text-align:center}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){.team-layout{grid-template-columns:1fr}.team-header{align-items:flex-start}.actions button{flex:1}}
</style>
<style scoped>
.farm-team{font-family:'Plus Jakarta Sans',sans-serif;background:#f4f8ef}.title-group{display:flex;gap:16px;align-items:center}.title-group>svg{color:#356440;flex-shrink:0}.team-layout{display:flex;flex-direction:column}.roster{order:0;min-width:0}.editor{order:-1;width:100%;border-left:5px solid #e4bd42;padding:24px}.editor fieldset{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}.editor .actions{grid-column:1/-1}.member-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:20px}.member-list li{padding:24px;border-radius:24px}.member-top{flex-wrap:nowrap;gap:12px;align-items:flex-start}.avatar{display:grid;place-items:center;width:48px;height:48px;flex:0 0 48px;border-radius:18px;background:#f6df82;color:#294e32;font-weight:800}.identity{flex:1;min-width:0}.identity h4{font-size:1.1rem}.identity .role{margin:4px 0;font-weight:500}.member-top .status{padding:5px 8px;font-size:.72rem}.permission{display:flex;gap:8px;align-items:center;font-size:.78rem;color:#526b50;border-top:1px solid #e2eadc;padding-top:14px}.farm-team button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:44px}.farm-team input,.farm-team select{min-height:44px}.privacy{font-size:.87rem;max-width:80ch}.farm-team h3{font-size:1.15rem}.count{display:inline-block;margin-left:8px}.farm-team :deep(svg){flex-shrink:0}@media(max-width:560px){.editor fieldset{grid-template-columns:1fr}.team-header>button{width:100%}.editor{padding:16px}.title-group{align-items:flex-start}.member-top{flex-wrap:wrap}.member-top .status{margin-left:60px}.identity{flex-basis:calc(100% - 60px)}}
</style>
