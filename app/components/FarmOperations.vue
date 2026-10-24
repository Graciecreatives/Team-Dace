<script setup>
import { computed, reactive, ref, watch } from 'vue'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean, section: { type: String, default: 'operations' } })
const emit = defineEmits(['command'])
const operations = computed(() => props.state.operations || { members: [], tasks: [], invitations: [], movements: [] })
const owner = computed(() => props.state.farm?.role === 'owner')
const manage = computed(() => ['owner', 'manager'].includes(props.state.farm?.role))
const canUpdate = item => manage.value || (props.state.farm?.role === 'worker' && item.assigneeId === props.state.currentUserId)
const invite = reactive({ email: '', role: 'worker' })
const accept = reactive({ token: '' })
const task = reactive({ title: '', dueOn: '', assigneeId: '', seasonId: '' })
const consume = reactive({})
const pending = ref(null)
const submit = (action, fields) => {
  pending.value = { action, id: fields.id }
  emit('command', { action, ...fields })
}
watch(() => props.state.lastCommandId, (id, previous) => {
  if (!id || id === previous || props.state.result?.action !== pending.value?.action) return
  const action = pending.value.action
  if (action === 'team.invite') Object.assign(invite, { email: '', role: 'worker' })
  if (action === 'team.accept') accept.token = ''
  if (action === 'tasks.create') Object.assign(task, { title: '', dueOn: '', assigneeId: '', seasonId: '' })
  if (action === 'tasks.consume') delete consume[pending.value.id]
  pending.value = null
})
const memberName = id => operations.value.members.find(m => m.userId === id)?.name || 'Unassigned'
</script>

<template>
  <section class="farm-operations" :aria-busy="busy">
    <template v-if="section === 'team'">
      <header><p class="eyebrow">Connected farm</p><h2>Team access</h2><p>These accounts can use this farm's shared tools. Your profile and settings remain private.</p></header>
      <form class="card" @submit.prevent="submit('team.accept', accept)">
        <h3>Accept a farm invitation</h3><p>Sign in with the invited email address, then paste the private token. Invitations expire after seven days.</p>
        <label>Invitation token<input v-model="accept.token" required maxlength="64" autocomplete="off" spellcheck="false" /></label>
        <button :disabled="busy || !accept.token">Join invited farm</button>
      </form>
      <form v-if="owner" class="card grid" @submit.prevent="submit('team.invite', invite)">
        <h3>Invite an account</h3><label>Email address<input v-model="invite.email" type="email" required maxlength="254" /></label>
        <label>Access role<select v-model="invite.role"><option value="worker">Worker</option><option value="manager">Manager</option><option value="viewer">Viewer</option></select></label>
        <p>Managers plan and manage tasks and business. Workers complete assigned tasks and consume stock. Viewers have read-only planning and task access.</p>
        <button :disabled="busy">Create private invitation</button>
      </form>
      <div v-if="owner && state.result?.token" class="card token" role="status"><h3>Share this token privately</h3><p>No email was sent. This token is returned only once. Copy it before leaving or sending another command.</p><code>{{ state.result.token }}</code></div>
      <div class="card"><h3>Farm accounts</h3><ul><li v-for="member in operations.members" :key="member.userId"><span>{{ member.name }} · {{ member.role }}</span><button v-if="owner && member.role !== 'owner'" :disabled="busy" class="secondary" @click="submit('team.remove', { userId: member.userId })">Revoke access</button></li></ul></div>
      <div v-if="owner && operations.invitations.length" class="card"><h3>Invitations</h3><ul><li v-for="invitation in operations.invitations" :key="invitation.id">{{ invitation.email }} · {{ invitation.role }} · {{ invitation.revokedAt ? 'Revoked' : invitation.acceptedAt ? 'Accepted' : `Expires ${invitation.expiresAt.slice(0, 10)}` }}<button v-if="!invitation.acceptedAt && !invitation.revokedAt" :disabled="busy" class="secondary" @click="submit('team.revoke', { id: invitation.id })">Revoke invitation</button></li></ul></div>
    </template>
    <template v-else>
      <header><p class="eyebrow">Daily work</p><h2>Farm operations</h2><p>Assign real farm accounts, track completion and record stock used for each task.</p></header>
      <form v-if="manage" class="card grid" @submit.prevent="submit('tasks.create', task)">
        <h3>Create a task</h3><label>Task title<input v-model="task.title" required maxlength="200" /></label><label>Due date<input v-model="task.dueOn" type="date" required /></label>
        <label>Assignee<select v-model="task.assigneeId"><option value="">Unassigned</option><option v-for="member in operations.members.filter(m => m.role !== 'viewer')" :key="member.userId" :value="member.userId">{{ member.name }} ({{ member.role }})</option></select></label>
        <label>Season<select v-model="task.seasonId"><option value="">No season</option><option v-for="season in state.planning?.seasons || []" :key="season.id" :value="season.id">{{ season.name }}</option></select></label><button :disabled="busy">Create task</button>
      </form>
      <p v-if="!operations.tasks.length" class="card">No tasks yet.</p>
      <article v-for="item in operations.tasks" :key="item.id" class="card">
        <h3>{{ item.title }}</h3><p>Due {{ item.dueOn }} · {{ memberName(item.assigneeId) }} · {{ item.completed ? 'Completed' : 'Open' }}</p>
        <button v-if="canUpdate(item)" :disabled="busy" class="secondary" @click="submit('tasks.complete', { id: item.id, completed: !item.completed })">{{ item.completed ? 'Reopen task' : 'Mark complete' }}</button>
        <form v-if="canUpdate(item) && !item.completed" class="consume" @submit.prevent="submit('tasks.consume', { id: item.id, inventoryId: consume[item.id]?.inventoryId, quantity: Number(consume[item.id]?.quantity) })">
          <label>Inventory to use<select :value="consume[item.id]?.inventoryId || ''" required @change="consume[item.id] = { ...consume[item.id], inventoryId: $event.target.value }"><option value="">Choose stock</option><option v-for="stock in state.inventory || []" :key="stock.id" :value="stock.id">{{ stock.name }} · {{ stock.quantity }} {{ stock.unit }}</option></select></label>
          <label>Quantity<input :value="consume[item.id]?.quantity || ''" type="number" min="0.000001" step="0.000001" required @input="consume[item.id] = { ...consume[item.id], quantity: $event.target.value }" /></label><button :disabled="busy">Record stock used</button>
        </form><p v-if="state.farm?.role === 'worker'" class="hint">Only the assigned worker can update this task. Stock use cannot be undone here.</p>
      </article>
      <div v-if="operations.movements.length" class="card"><h3>Stock usage history</h3><ul><li v-for="movement in operations.movements" :key="movement.id">{{ movement.createdAt.slice(0, 10) }} · {{ state.inventory?.find(s => s.id === movement.inventoryId)?.name || 'Stock' }} · {{ movement.quantity }} used · {{ memberName(movement.actorId) }}</li></ul></div>
    </template>
  </section>
</template>

<style scoped>
.farm-operations{display:grid;gap:1rem;color:#173c28}.farm-operations header p{color:#52705d}.eyebrow{text-transform:uppercase;font-size:.75rem;letter-spacing:.12em;font-weight:700}h2{font-size:1.65rem;font-weight:800}h3{font-size:1.08rem;font-weight:700}.card{padding:1.2rem;background:white;border:1px solid #dce7dc;border-radius:1rem;display:grid;gap:.8rem}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid h3,.grid p{grid-column:1/-1}label{display:grid;gap:.35rem;font-size:.9rem;font-weight:600}input,select{border:1px solid #b8cbb9;border-radius:.55rem;padding:.65rem;min-width:0;width:100%;background:#fff;color:#173c28}button{background:#255c36;color:white;border-radius:.6rem;padding:.65rem 1rem;font-weight:700;width:fit-content}button:disabled{opacity:.5;cursor:wait}.secondary{background:#f5d968;color:#24452d}.consume{display:flex;align-items:end;gap:.7rem;flex-wrap:wrap}.consume label{flex:1;min-width:140px}ul{display:grid;gap:.7rem}li{display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap}.token{background:#fff8d6}.token code{white-space:pre-wrap;overflow-wrap:anywhere;user-select:all}.hint{font-size:.8rem;color:#647564}@media(max-width:600px){.grid{grid-template-columns:1fr}.card{padding:1rem}.consume button{width:100%}}
</style>
