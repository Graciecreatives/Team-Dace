<script setup>
const props = defineProps({ user: { type: Object, default: () => ({}) } })
const members = ref([])
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const feedback = ref('')
const editing = ref('')
const removing = ref('')
const search = ref('')
const blank = () => ({ name: '', contact: '', role: '', responsibilities: '', status: 'active' })
const draft = reactive(blank())
const owner = computed(() => props.user?.id || '')
const visible = computed(() => members.value.filter(m => `${m.name} ${m.role} ${m.responsibilities}`.toLowerCase().includes(search.value.toLowerCase())))
let generation = 0, mounted = false, controller
function clearDraft() { editing.value = ''; Object.assign(draft, blank()) }
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
function editMember(member) { editing.value = member.id; removing.value = ''; Object.assign(draft, { name: member.name, contact: member.contact, role: member.role, responsibilities: member.responsibilities, status: member.status }) }
function save() { request({ ...draft, action: editing.value ? 'edit' : 'add', ...(editing.value ? { id: editing.value } : {}) }) }
watch(owner, resetOwner, { flush: 'sync' })
onMounted(() => { mounted = true; resetOwner() })
onUnmounted(() => { mounted = false; generation++; controller?.abort() })
</script>

<template>
  <section class="farm-team" aria-labelledby="team-title" :aria-busy="busy">
    <header class="team-header"><div><p class="eyebrow">PEOPLE BEHIND THE HARVEST</p><h2 id="team-title">Your farm team</h2><p>Keep the right people and responsibilities in one place.</p></div><span class="count">{{ members.length }} / 100 members</span></header>
    <p class="privacy"><strong>A private roster, not account access.</strong> Adding a person does not send an invitation or let them sign in to your farm. Only your signed-in account can manage this list. Save contact details only with permission.</p>
    <p v-if="!owner" class="notice">Sign in to manage your farm roster.</p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p><p role="status" aria-live="polite">{{ feedback }}</p>
    <div v-if="owner" class="team-layout">
      <form class="editor" @submit.prevent="save">
        <h3>{{ editing ? 'Edit roster member' : 'Add a helping hand' }}</h3><p>Record a person, their work and how to reach them.</p>
        <fieldset :disabled="busy || !loaded"><legend class="sr-only">Member details</legend>
          <label>Name <input v-model="draft.name" required maxlength="100" autocomplete="off" placeholder="e.g. Ada Okeke"></label>
          <label>Contact <span class="optional">optional</span><input v-model="draft.contact" maxlength="150" autocomplete="off" placeholder="Phone or email"></label>
          <label>Farm role <input v-model="draft.role" required maxlength="80" placeholder="e.g. Field supervisor"></label>
          <label>Responsibilities <span class="optional">optional</span><textarea v-model="draft.responsibilities" maxlength="600" rows="3" placeholder="Irrigation checks, harvest planning…" /></label>
          <label>Roster status <select v-model="draft.status"><option value="active">Active</option><option value="seasonal">Seasonal</option><option value="inactive">Inactive</option></select></label>
          <div class="actions"><button :disabled="!editing && members.length >= 100">{{ busy ? 'Saving…' : editing ? 'Save changes' : 'Add to roster' }}</button><button v-if="editing" type="button" class="secondary" @click="clearDraft">Cancel edit</button></div>
        </fieldset>
      </form>
      <div class="roster"><div class="roster-heading"><h3>Team roster</h3><button class="secondary" type="button" :disabled="busy" @click="request()">{{ busy ? 'Loading…' : 'Refresh' }}</button></div>
        <label>Find a team member<input v-model="search" type="search" placeholder="Search name, role or responsibility"></label>
        <p v-if="!loaded">{{ busy ? 'Loading your roster…' : 'Refresh to load your roster.' }}</p>
        <div v-else-if="!members.length" class="empty"><h3>Good work starts with good people.</h3><p>Add your first roster member to organise the season. No messages will be sent.</p></div>
        <p v-else-if="!visible.length">No members match your search.</p>
        <ul class="member-list"><li v-for="member in visible" :key="member.id"><div class="member-top"><h4>{{ member.name }}</h4><span class="status" :class="member.status">{{ member.status }}</span></div><p class="role">{{ member.role }}</p><p v-if="member.contact">{{ member.contact }}</p><p class="responsibilities">{{ member.responsibilities || 'No responsibilities recorded yet.' }}</p>
          <div v-if="removing === member.id" class="notice"><p>Remove {{ member.name }} from the roster? This cannot be undone. Their account access is not affected.</p><div class="actions"><button type="button" :disabled="busy" @click="request({ action: 'remove', id: member.id })">Confirm removal</button><button type="button" class="secondary" :disabled="busy" @click="removing = ''">Keep member</button></div></div>
          <div v-else class="actions"><button type="button" class="secondary" :disabled="busy" @click="editMember(member)">Edit</button><button type="button" class="remove" :disabled="busy" @click="removing = member.id">Remove <span class="sr-only">{{ member.name }}</span></button></div>
        </li></ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.farm-team{color:#233e2d;background:#f7f9f3;border:1px solid #dce5d5;border-radius:24px;padding:clamp(16px,3vw,32px)}.team-header,.member-top,.roster-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.eyebrow{font-size:.7rem;letter-spacing:.14em;font-weight:800;color:#647b41}.farm-team h2{font-size:clamp(1.6rem,4vw,2rem);font-weight:800}.farm-team h3,.farm-team h4{font-weight:750}.farm-team p{line-height:1.6;margin:8px 0}.count,.status{border-radius:30px;padding:6px 12px;background:#e4edd8;font-size:.8rem;font-weight:700}.privacy{background:#edf1e5;padding:16px;border-radius:14px}.notice{background:#fff1d5;padding:12px;border-radius:10px}.team-layout{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,1.6fr);gap:24px;margin-top:24px}.editor,.member-list li{padding:20px;background:#fff;border:1px solid #dce5d5;border-radius:16px}.editor{align-self:start}.farm-team fieldset{border:0;padding:0;min-width:0}.farm-team label{display:block;font-weight:650;font-size:.9rem;margin:16px 0}.optional{font-size:.75rem;color:#647361;font-weight:400}.farm-team input,.farm-team select,.farm-team textarea{display:block;width:100%;min-width:0;margin-top:6px;padding:11px;border:1px solid #9aaa94;border-radius:9px;background:#fff;color:#233e2d}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.farm-team button{background:#305d36;color:white;padding:10px 14px;min-height:44px;border:1px solid transparent;border-radius:9px;font-weight:650}.farm-team button.secondary{background:#fff;border-color:#a7b69c;color:#305d36}.farm-team button.remove{background:#fff;color:#933a27}.farm-team button:disabled{opacity:.5;cursor:not-allowed}.farm-team :focus-visible{outline:3px solid #b77a20;outline-offset:3px}.member-list{display:grid;gap:14px;padding:0;list-style:none}.member-list li{overflow-wrap:anywhere}.role{font-weight:650}.responsibilities{color:#5c6b57;white-space:pre-wrap}.status{text-transform:capitalize}.status.inactive{background:#eee;color:#555}.status.seasonal{background:#fff0c7;color:#77521c}.empty{padding:28px 16px;border:1px dashed #b4c3a9;border-radius:14px;text-align:center}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){.team-layout{grid-template-columns:1fr}.team-header{align-items:flex-start}.actions button{flex:1}}
</style>
