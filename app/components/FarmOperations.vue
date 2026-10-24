<script setup>
import { computed, reactive, ref, watch, nextTick } from 'vue'
import { Check, RotateCcw, Plus, PackageOpen, ClipboardList } from 'lucide-vue-next'
import FbButton from './ui/FbButton.vue'
import FbBadge from './ui/FbBadge.vue'
import FbPageHeader from './ui/FbPageHeader.vue'
import FbPanel from './ui/FbPanel.vue'
import FbEmptyState from './ui/FbEmptyState.vue'
import FbBoard from './ui/FbBoard.vue'
import { emptyTask, emptyInvite, sameDraft, snapshot, canUpdateTask, isOverdue, filterTasks, taskColumns, stockLimit, validConsumption, matchesReceipt } from '../utils/operations-board.js'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean, section: { type: String, default: 'operations' } })
const emit = defineEmits(['command'])
const operations = computed(() => ({ members: [], tasks: [], invitations: [], movements: [], ...props.state.operations }))
const owner = computed(() => props.state.farm?.role === 'owner')
const manage = computed(() => ['owner', 'manager'].includes(props.state.farm?.role))
const canUpdate = item => canUpdateTask(props.state, item)
const invite = reactive(emptyInvite()), accept = reactive({ token: '' }), task = reactive(emptyTask()), consume = reactive({})
const pending = ref(null), submitting = ref(false), editorOpen = ref(false), view = ref('board'), confirmation = ref(null), copyMessage = ref('')
const filters = reactive({ search: '', assignee: '', season: '' })
const visibleTasks = computed(() => filterTasks(operations.value.tasks, filters, operations.value.members))
const columns = computed(() => taskColumns(visibleTasks.value))
const counts = computed(() => ({ open: operations.value.tasks.filter(t => !t.completed).length, completed: operations.value.tasks.filter(t => t.completed).length, overdue: operations.value.tasks.filter(t => isOverdue(t)).length }))
const completion = computed(() => operations.value.tasks.length ? Math.round(counts.value.completed / operations.value.tasks.length * 100) : 0)
const initials = id => id ? memberName(id).split(/\s+/).map(part => part[0]).slice(0, 2).join('') : '?'
const locked = computed(() => props.busy || submitting.value)
const memberName = id => operations.value.members.find(m => m.userId === id)?.name || (id ? 'Former member' : 'Unassigned')
const seasonName = id => props.state.planning?.seasons?.find(s => s.id === id)?.name || (id ? 'Previous season' : 'No season')
const draftFor = action => action === 'tasks.create' ? task : action === 'team.invite' ? invite : action === 'team.accept' ? accept : null
function submit(action, fields) {
  if (locked.value) return
  const item = operations.value.tasks.find(t => t.id === fields.id)
  if (action === 'tasks.create' && !manage.value) return
  if (['team.invite', 'team.remove', 'team.revoke'].includes(action) && !owner.value) return
  if (['tasks.complete', 'tasks.consume'].includes(action) && (!item || !canUpdate(item))) return
  if (action === 'tasks.consume' && (item.completed || !validConsumption(props.state.inventory || [], consume[item.id]))) return
  if (['team.remove', 'team.revoke'].includes(action) && (confirmation.value?.action !== action || confirmation.value?.key !== (fields.userId || fields.id))) return
  const draft = action === 'tasks.consume' ? consume[fields.id] : draftFor(action)
  pending.value = { action, id: fields.id, userId: fields.userId, before: props.state.lastCommandId, draft: draft ? snapshot(draft) : null }
  submitting.value = true
  emit('command', { action, ...snapshot(fields) })
  nextTick(() => { if (!props.busy) submitting.value = false })
}
watch(() => props.busy, busy => { if (!busy) submitting.value = false })
watch(() => props.state.lastCommandId, () => {
  if (!matchesReceipt(pending.value, props.state)) return
  const request = pending.value
  const draft = request.action === 'tasks.consume' ? consume[request.id] : draftFor(request.action)
  if (draft && sameDraft(draft, request.draft)) {
    if (request.action === 'tasks.consume') delete consume[request.id]
    else if (request.action === 'tasks.create') { Object.assign(task, emptyTask()); editorOpen.value = false }
    else if (request.action === 'team.invite') Object.assign(invite, emptyInvite())
    else accept.token = ''
  }
  confirmation.value = null
  pending.value = null
})
watch(() => `${props.state.farm?.id || ''}:${props.state.currentUserId || ''}`, () => {
  Object.assign(task, emptyTask()); Object.assign(invite, emptyInvite()); accept.token = ''
  Object.keys(consume).forEach(id => delete consume[id])
  Object.assign(filters, { search: '', assignee: '', season: '' })
  pending.value = null; confirmation.value = null; copyMessage.value = ''; editorOpen.value = false; submitting.value = false
}, { flush: 'sync' })
function consumption(id, key, value) { consume[id] = { ...consume[id], [key]: value } }
function ask(action, key) { if (!locked.value) confirmation.value = { action, key } }
async function copyToken() {
  copyMessage.value = ''
  try {
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Unavailable')
    await navigator.clipboard.writeText(props.state.result.token)
    copyMessage.value = 'Token copied. Share it privately.'
  } catch { copyMessage.value = 'Could not copy. Select the token below and copy it manually.' }
}
</script>

<template>
  <section class="farm-operations" :aria-busy="locked">
    <template v-if="section === 'team'">
      <FbPageHeader title="Team access" description="The right people, with the right access. Profiles and personal settings stay private." />
      <div class="team-editors">
        <FbPanel title="Invite an account" v-if="owner">
          <form class="form-grid" @submit.prevent="submit('team.invite', invite)">
            <label>Email address<input class="fb-input" v-model="invite.email" type="email" required maxlength="254" /></label>
            <label>Access role<select class="fb-input" v-model="invite.role"><option value="worker">Worker</option><option value="manager">Manager</option><option value="viewer">Viewer</option></select></label>
            <p class="hint span">Managers plan tasks and manage business. Workers update their assigned tasks and record stock use. Viewers have read-only planning and task access. Only owners manage access.</p>
            <FbButton type="submit" :busy="locked">Create private invitation</FbButton>
          </form>
        </FbPanel>
        <FbPanel title="Join an invited farm">
          <form class="stack" @submit.prevent="submit('team.accept', accept)">
            <p class="hint">Use the invited email account. Tokens expire after seven days.</p>
            <label>Private invitation token<input class="fb-input" v-model="accept.token" required maxlength="64" autocomplete="off" spellcheck="false" /></label>
            <FbButton type="submit" :disabled="!accept.token" :busy="locked">Join invited farm</FbButton>
          </form>
        </FbPanel>
      </div>
      <FbPanel v-if="owner && state.result?.action === 'team.invite' && state.result?.token" title="Share privately, once">
        <p>No email was sent. Copy this token before leaving or sending another command.</p>
        <code class="token">{{ state.result.token }}</code>
        <FbButton variant="secondary" @click="copyToken">Copy token</FbButton><p role="status">{{ copyMessage }}</p>
      </FbPanel>
      <FbPanel title="Farm accounts">
        <ul class="rows"><li v-for="member in operations.members" :key="member.userId">
          <div><strong>{{ member.name }}</strong><span v-if="member.userId === state.currentUserId"> (you)</span> <FbBadge>{{ member.role }}</FbBadge></div>
          <template v-if="owner && member.role !== 'owner'">
            <div v-if="confirmation?.action === 'team.remove' && confirmation.key === member.userId" class="confirm" role="group" :aria-label="`Confirm access removal for ${member.name}`"><p>Remove {{ member.name }}'s access to this farm?</p><FbButton variant="danger" :busy="locked" @click="submit('team.remove', { userId: member.userId })">Confirm revoke access</FbButton><FbButton variant="ghost" :disabled="locked" @click="confirmation = null">Cancel</FbButton></div>
            <FbButton v-else variant="ghost" :disabled="locked" @click="ask('team.remove', member.userId)">Revoke access</FbButton>
          </template>
        </li></ul>
      </FbPanel>
      <FbPanel v-if="owner" title="Invitations">
        <FbEmptyState v-if="!operations.invitations.length" title="No invitations yet" description="Create a private invitation to add someone to your farm." />
        <ul class="rows"><li v-for="invitation in operations.invitations" :key="invitation.id">
          <div><strong>{{ invitation.email }}</strong><p class="hint">{{ invitation.role }} · {{ invitation.revokedAt ? 'Revoked' : invitation.acceptedAt ? 'Accepted' : `Expires ${invitation.expiresAt.slice(0, 10)}` }}</p></div>
          <template v-if="!invitation.acceptedAt && !invitation.revokedAt">
            <div v-if="confirmation?.action === 'team.revoke' && confirmation.key === invitation.id" class="confirm" role="group" aria-label="Confirm invitation revocation"><p>Invalidate this invitation token?</p><FbButton variant="danger" :busy="locked" @click="submit('team.revoke', { id: invitation.id })">Confirm revoke invitation</FbButton><FbButton variant="ghost" :disabled="locked" @click="confirmation = null">Cancel</FbButton></div>
            <FbButton v-else variant="ghost" :disabled="locked" @click="ask('team.revoke', invitation.id)">Revoke invitation</FbButton>
          </template>
        </li></ul>
      </FbPanel>
    </template>
    <template v-else>
      <header class="work-heading"><div><h2>Good work starts here.</h2><p>Choose a task. Gather your inputs. Keep the whole farm moving.</p></div><FbButton v-if="manage" :disabled="locked" :aria-expanded="editorOpen" aria-controls="task-editor" @click="editorOpen = !editorOpen"><Plus :size="20" aria-hidden="true" />{{ editorOpen ? 'Close editor' : 'Create task' }}</FbButton></header>
      <div class="work-pulse" aria-label="All farm tasks"><div class="pulse-title"><ClipboardList :size="30" aria-hidden="true" /><div><strong>{{ counts.open ? `${counts.open} tasks to move forward` : 'Nothing left open' }}</strong><p>{{ counts.overdue ? `${counts.overdue} overdue tasks need attention` : 'No overdue tasks' }}</p></div></div><div class="completion"><div><strong>{{ completion }}% complete</strong><span>{{ counts.completed }} of {{ operations.tasks.length }} tasks</span></div><progress :value="counts.completed" :max="operations.tasks.length || 1" aria-label="Confirmed task completion" /></div></div>
      <FbPanel v-if="manage && editorOpen" title="Create a task" id="task-editor">
        <form class="form-grid" @submit.prevent="submit('tasks.create', task)">
          <label>Task title<input class="fb-input" v-model="task.title" required maxlength="200" /></label><label>Due date<input class="fb-input" v-model="task.dueOn" type="date" required /></label>
          <label>Assignee<select class="fb-input" v-model="task.assigneeId"><option value="">Unassigned</option><option v-for="member in operations.members.filter(m => m.role !== 'viewer')" :key="member.userId" :value="member.userId">{{ member.name }} ({{ member.role }})</option></select></label>
          <label>Season<select class="fb-input" v-model="task.seasonId"><option value="">No season</option><option v-for="season in state.planning?.seasons || []" :key="season.id" :value="season.id">{{ season.name }}</option></select></label>
          <FbButton type="submit" :busy="locked">Create task</FbButton>
        </form>
      </FbPanel>
      <div class="toolbar">
        <label class="search">Search tasks<input class="fb-input" v-model="filters.search" type="search" placeholder="Task or teammate" /></label>
        <label>Assignee<select class="fb-input" v-model="filters.assignee"><option value="">Everyone</option><option value="unassigned">Unassigned</option><option v-for="member in operations.members" :key="member.userId" :value="member.userId">{{ member.name }}</option></select></label>
        <label>Season<select class="fb-input" v-model="filters.season"><option value="">All seasons</option><option value="none">No season</option><option v-for="season in state.planning?.seasons || []" :key="season.id" :value="season.id">{{ season.name }}</option></select></label>
        <div class="view-toggle" role="group" aria-label="Task view"><FbButton :variant="view === 'board' ? 'primary' : 'ghost'" :aria-pressed="view === 'board'" @click="view = 'board'">Board</FbButton><FbButton :variant="view === 'list' ? 'primary' : 'ghost'" :aria-pressed="view === 'list'" @click="view = 'list'">List</FbButton></div>
      </div>
      <p class="hint" role="status">Showing {{ visibleTasks.length }} of {{ operations.tasks.length }} tasks. Completion reflects confirmed farm state.</p>
      <FbEmptyState v-if="!visibleTasks.length" :title="operations.tasks.length ? 'No matching tasks' : 'A clear start to the day'" :description="operations.tasks.length ? 'Try another search or clear your filters.' : 'Create a task to plan your next farm operation.'"><FbButton v-if="operations.tasks.length" variant="secondary" @click="Object.assign(filters, { search: '', assignee: '', season: '' })">Clear filters</FbButton></FbEmptyState>
      <component v-else :is="view === 'board' ? FbBoard : 'div'" :columns="view === 'board' ? columns : undefined" :label="view === 'board' ? 'Farm task board' : undefined" :class="{ 'task-list': view === 'list' }">
        <template #item="{ item }">
          <article class="task-card" :class="{ 'is-complete': item.completed, 'is-overdue': isOverdue(item) }"><div class="card-top"><FbBadge :tone="item.completed ? 'success' : 'neutral'">{{ item.completed ? 'Completed' : 'Open' }}</FbBadge><FbBadge v-if="isOverdue(item)" tone="danger">Overdue</FbBadge></div><h3>{{ item.title }}</h3><p class="task-due">Due {{ item.dueOn }}</p><div class="task-person"><span class="avatar" aria-hidden="true">{{ initials(item.assigneeId) }}</span><span><strong>{{ memberName(item.assigneeId) }}</strong><small>{{ seasonName(item.seasonId) }}</small></span></div>
            <FbButton v-if="canUpdate(item)" variant="secondary" :busy="locked" @click="submit('tasks.complete', { id: item.id, completed: !item.completed })"><component :is="item.completed ? RotateCcw : Check" :size="20" aria-hidden="true" />{{ item.completed ? 'Reopen task' : 'Mark complete' }}</FbButton>
            <details v-if="canUpdate(item) && !item.completed" class="stock-details"><summary><PackageOpen :size="20" aria-hidden="true" />Record input use</summary><form class="stack" @submit.prevent="submit('tasks.consume', { id: item.id, inventoryId: consume[item.id]?.inventoryId, quantity: Number(consume[item.id]?.quantity) })"><p class="hint">Stock is deducted immediately after confirmation and cannot be undone here.</p><label>Inventory<select class="fb-input" :value="consume[item.id]?.inventoryId || ''" required @change="consumption(item.id, 'inventoryId', $event.target.value)"><option value="">Choose stock</option><option v-for="stock in state.inventory || []" :key="stock.id" :value="stock.id" :disabled="stock.quantity <= 0">{{ stock.name }} · {{ stock.quantity }} {{ stock.unit }}</option></select></label><label>Quantity<input class="fb-input" :value="consume[item.id]?.quantity ?? ''" type="number" min="0.000001" step="0.000001" :max="stockLimit(state.inventory || [], consume[item.id]?.inventoryId)" required @input="consumption(item.id, 'quantity', $event.target.value)" /></label><FbButton type="submit" :busy="locked" :disabled="!validConsumption(state.inventory || [], consume[item.id])">Record stock used</FbButton></form></details>
          </article>
        </template>
        <template v-if="view === 'list'" #default>
          <article v-for="item in visibleTasks" :key="item.id" class="task-card list-card">
            <div><h3>{{ item.title }}</h3><p class="hint">Due {{ item.dueOn }} · {{ memberName(item.assigneeId) }} · {{ seasonName(item.seasonId) }}</p></div><FbBadge :tone="item.completed ? 'success' : 'neutral'">{{ item.completed ? 'Completed' : 'Open' }}</FbBadge><FbBadge v-if="isOverdue(item)" tone="danger">Overdue</FbBadge><FbButton v-if="canUpdate(item)" variant="secondary" :busy="locked" @click="submit('tasks.complete', { id: item.id, completed: !item.completed })"><component :is="item.completed ? RotateCcw : Check" :size="20" aria-hidden="true" />{{ item.completed ? 'Reopen task' : 'Mark complete' }}</FbButton><FbButton v-if="canUpdate(item) && !item.completed" variant="ghost" @click="view = 'board'">Record inputs in board</FbButton>
          </article>
        </template>
      </component>
      <FbPanel v-if="operations.movements.length" title="Stock usage history"><ul class="rows"><li v-for="movement in operations.movements" :key="movement.id"><span>{{ movement.createdAt.slice(0, 10) }} · {{ state.inventory?.find(s => s.id === movement.inventoryId)?.name || 'Stock' }}</span><span>{{ movement.quantity }} used · {{ memberName(movement.actorId) }}</span></li></ul></FbPanel>
    </template>
  </section>
</template>

<style scoped>
.farm-operations{display:grid;gap:1.5rem;color:var(--fb-text,#193d2b);width:100%;min-width:0}.team-editors,.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.stack{display:grid;gap:1rem}.span{grid-column:1/-1}.hint{font-size:.85rem;color:var(--fb-muted,#657568);line-height:1.6}label{display:grid;gap:.4rem;font-size:.82rem;font-weight:600;min-width:0}.toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:1rem}.toolbar label{flex:1;min-width:150px}.toolbar .search{flex:2}.view-toggle{display:flex;padding:.25rem;background:#F5F6F0;border-radius:.75rem}.task-card{padding:1.2rem;border:1px solid var(--fb-border,#e1e8dd);background:#fff;border-radius:1rem;display:grid;gap:.75rem;min-width:0}.task-card h3{font-size:1.05rem;font-weight:700;overflow-wrap:anywhere}.card-top{display:flex;gap:.5rem;flex-wrap:wrap}.stock-details{border-top:1px solid #e1e8dd;padding-top:.75rem}.stock-details summary{cursor:pointer;color:#066136;font-size:.85rem;font-weight:600}.stock-details form{margin-top:1rem}.rows{list-style:none;padding:0;display:grid;gap:0}.rows li{padding:1rem 0;border-bottom:1px solid #e1e8dd;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}.rows li:last-child{border:0}.confirm{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;background:#fff6e1;padding:.75rem;border-radius:.75rem}.confirm p{width:100%;font-size:.85rem}.token{display:block;overflow-wrap:anywhere;user-select:all;background:#F5F6F0;padding:1rem;border-radius:.75rem;margin:1rem 0}.task-list{display:grid;gap:.75rem}.list-card{display:flex;align-items:center;flex-wrap:wrap}.list-card>div:first-child{flex:1;min-width:180px}@media(max-width:700px){.team-editors,.form-grid{grid-template-columns:1fr}.toolbar{align-items:stretch}.view-toggle{width:fit-content}}
.farm-operations{font-family:'Plus Jakarta Sans',sans-serif}.work-heading{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:1.5rem 0}.work-heading h2{font-size:clamp(2rem,4vw,3.3rem);line-height:1.12;letter-spacing:-.055em;font-weight:800}.work-heading p{margin-top:.8rem;color:#526858;max-width:55ch;line-height:1.6}.work-pulse{display:grid;grid-template-columns:1fr minmax(220px,.7fr);align-items:center;gap:2rem;background:#066136;color:white;border-radius:24px;padding:1.75rem 2rem}.pulse-title{display:flex;align-items:center;gap:1rem}.pulse-title>svg{color:#F9C23C;flex-shrink:0}.pulse-title strong{font-size:1.25rem}.pulse-title p{font-size:.9rem;margin-top:.4rem;color:#dfecd9}.completion>div{display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap;font-size:.85rem}.completion span{color:#dfecd9}.completion progress{display:block;width:100%;height:10px;margin-top:.8rem;appearance:none;border:0;border-radius:10px;overflow:hidden;background:#538567}.completion progress::-webkit-progress-bar{background:#538567;border-radius:10px}.completion progress::-webkit-progress-value{background:#F9C23C;border-radius:10px}.completion progress::-moz-progress-bar{background:#F9C23C;border-radius:10px}.farm-operations .toolbar{background:#F5F6F0;border-radius:20px;padding:1.25rem;gap:1rem}.farm-operations .task-card{border-radius:20px;padding:1.4rem;gap:.9rem;box-shadow:0 4px 0 #e3e9dc;border:1px solid #d8e1d3;align-content:start}.farm-operations .task-card h3{font-size:1.2rem;line-height:1.4;letter-spacing:-.02em}.farm-operations .task-card.is-overdue{border-top:4px solid #b86a29}.task-card.is-complete{background:#f1f6ed}.task-person{display:flex;align-items:center;gap:.65rem;padding:.7rem 0;border-top:1px solid #e1e8dd}.task-person>span:last-child{display:grid;gap:.25rem;min-width:0}.task-person strong{font-size:.85rem;overflow-wrap:anywhere}.task-person small{font-size:.8rem;color:#526858}.avatar{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border-radius:50%;background:#e6eedb;color:#066136;font-size:.8rem;font-weight:800}.task-due{font-size:.85rem;color:#526858}.farm-operations :deep(button){min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:.5rem;font-family:inherit;white-space:normal}.task-card:not(.list-card) :deep(button){width:100%;font-size:.95rem}.farm-operations .stock-details summary{display:flex;align-items:center;gap:.6rem;min-height:44px;font-size:.95rem;list-style:none}.stock-details summary:after{content:'＋';margin-left:auto}.stock-details[open] summary:after{content:'−'}.farm-operations :deep(button:focus-visible),.farm-operations summary:focus-visible{outline:3px solid #b48000;outline-offset:3px}.farm-operations :deep(.fb-board){gap:1.25rem;min-width:0}.farm-operations :deep(.fb-board-column){background:#F5F6F0;border:0;border-radius:24px;padding:1rem;min-width:0}.farm-operations :deep(.fb-board-column>header){padding:.5rem .25rem 1rem}.farm-operations input,.farm-operations select{min-height:44px;width:100%;min-width:0}.farm-operations *{overflow-wrap:anywhere;box-sizing:border-box}@media(max-width:900px){.work-pulse{grid-template-columns:1fr;gap:1.25rem}.farm-operations :deep(.fb-board){grid-template-columns:1fr}}@media(max-width:600px){.work-heading{flex-direction:column;align-items:start}.work-pulse{padding:1.25rem}.toolbar label{min-width:0;flex-basis:100%}.farm-operations :deep(.fb-board-column){padding:.75rem}.farm-operations .task-card{padding:1rem}}@media(prefers-reduced-motion:reduce){.farm-operations *{transition:none!important;animation:none!important}}
</style>
