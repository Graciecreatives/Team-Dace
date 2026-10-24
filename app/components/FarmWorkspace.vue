<script setup>
import { Sprout, RefreshCw, Wifi, WifiOff, NotebookPen } from 'lucide-vue-next'
import FarmProduction from './FarmProduction.vue'
import FarmOperations from './FarmOperations.vue'
import FarmBusiness from './FarmBusiness.vue'
import FarmTeam from './FarmTeam.vue'
const emit = defineEmits(['changed', 'navigate'])
const props = defineProps({ user: { type: Object, required: true }, section: { type: String, default: 'planning' } })
const { state, farmId, busy, error, message, queue, enabled, stale, online, uncertain, load, command, sync, selectFarm, enableDevice, discard } = useFarmWorkspace(computed(() => props.user))
const deleting = ref('')
watch(() => state.value?.lastCommandId, id => { if (id) emit('changed') })
</script>

<template>
  <section class="connected-workspace" :aria-busy="busy">
    <div class="workspace-toolbar">
      <label><span class="farm-selector-label"><Sprout :size="16" aria-hidden="true" />Working farm</span>
        <select :value="farmId" :disabled="busy || !!uncertain" @change="selectFarm($event.target.value)">
          <option v-if="!state" :value="user.id">{{ user.farmName || 'My farm' }}</option>
          <option v-for="farm in state?.farms || []" :key="farm.id" :value="farm.id">{{ farm.name }} · {{ farm.role }}</option>
        </select>
      </label>
      <div class="workspace-status"><span><component :is="online ? Wifi : WifiOff" :size="15" aria-hidden="true" />{{ online ? 'Connected' : 'Offline' }}</span><span v-if="state">{{ state.farm.role }}</span><button type="button" :disabled="busy || !online" @click="load"><RefreshCw :size="15" aria-hidden="true" />Refresh</button></div>
    </div>
    <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
    <p v-if="message" class="workspace-success" role="status">{{ message }}</p>
    <p v-if="stale" class="workspace-warning">Cached information only. Stock, roles and task assignments may have changed. Changes are checked by the server when synced.</p>
    <p v-if="!state && busy" class="workspace-loading" role="status"><Sprout :size="24" aria-hidden="true" />Loading your farm…</p>
    <template v-if="state">
      <FarmProduction v-if="section === 'planning'" :key="state.farm.id" :state="state" :command-error="error" :busy="busy || !!uncertain" @command="command" />
      <FarmOperations v-if="['operations', 'team'].includes(section)" :key="`${state.farm.id}:${section}`" :section="section" :state="state" :busy="busy || !!uncertain" @command="command" />
      <FarmBusiness v-if="section === 'business'" :key="state.farm.id" :state="state" :current-user-id="user.id || ''" @navigate="emit('navigate', $event)" :command-error="error" :busy="busy || !!uncertain" @command="command" />
      <details v-if="section === 'team' && state.farm.id === user.id" class="legacy-roster"><summary>Contact notebook (contacts do not grant account access)</summary><FarmTeam :user="user" /></details>
    </template>
    <details class="offline-panel">
      <summary><NotebookPen :size="18" aria-hidden="true" />Work without a connection <span v-if="queue.length">· {{ queue.length }} pending</span></summary>
      <p>Opt in on a trusted device to keep a workspace copy and drafts for observations, harvests, task completion and input use. Drafts do not change server stock or money until synced. This is not a fully offline-installable app: open it online first.</p>
      <label class="consent"><input type="checkbox" :checked="enabled" :disabled="busy" @change="enableDevice($event.target.checked)"> Keep private farm data on this device. Other people using this browser may see it.</label>
      <div v-if="queue.length || uncertain" class="pending-actions"><button type="button" :disabled="busy || !online" @click="sync">{{ uncertain ? 'Retry unconfirmed request' : 'Review complete: sync pending changes' }}</button><p>Replays use the same IDs to prevent duplicate entries. A changed role, task or stock level can block sync.</p></div>
      <ul><li v-for="item in queue" :key="item.commandId"><span>{{ item.action }} · {{ item.date || item.id || item.seasonId || 'Draft' }}</span><button v-if="deleting !== item.commandId" type="button" :disabled="busy" @click="deleting = item.commandId">Discard…</button><template v-else><span>A request may already have reached the server. Discarding does not undo it.</span><button type="button" :disabled="busy" @click="discard(item.commandId); deleting = ''">Discard device draft</button><button type="button" @click="deleting = ''">Keep</button></template></li></ul>
    </details>
  </section>
</template>

<style scoped>
.farm-selector-label{display:flex;align-items:center;gap:6px}.workspace-status span,.workspace-status>button{display:inline-flex;align-items:center;gap:7px;min-height:40px}.workspace-loading{display:flex;align-items:center;gap:12px;padding:60px 24px;justify-content:center;color:#526c46}.offline-panel{margin-top:32px}.offline-panel summary{min-height:44px;align-content:center}.offline-panel summary svg{display:inline-block;vertical-align:middle;margin-right:8px}.legacy-roster{margin-top:28px}
.connected-workspace{width:100%;color:#193d2b;min-width:0}.workspace-toolbar{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:20px;flex-wrap:wrap}.workspace-toolbar label{display:grid;gap:7px;font-size:12px;font-weight:700;min-width:0;max-width:100%}.workspace-toolbar select{padding:11px 14px;border:1px solid #dce5d8;border-radius:12px;background:white;max-width:100%;font:inherit;font-size:14px}.workspace-status{display:flex;gap:10px;align-items:center;font-size:12px;flex-wrap:wrap}.workspace-status span{padding:6px 10px;border-radius:20px;background:#e9f1df}.workspace-status>button,.offline-panel button{border:1px solid #d2dfc8;padding:8px 12px;border-radius:10px;background:white;color:#066136;font-size:12px;font-weight:700}.connected-workspace button:disabled{opacity:.5}.workspace-error,.workspace-warning,.workspace-success{padding:14px;border-radius:12px;font-size:13px;margin:12px 0;overflow-wrap:anywhere}.workspace-error{background:#fff0ec;color:#983c20}.workspace-warning{background:#fff6db}.workspace-success{background:#eaf3e0}.offline-panel,.legacy-roster{border:1px solid #dce5d8;border-radius:14px;padding:16px;background:#fafbf7;margin-bottom:24px;font-size:12px;line-height:1.8}.offline-panel summary,.legacy-roster summary{font-weight:700;cursor:pointer}.offline-panel p{margin:10px 0;color:#617456}.consent{display:flex;gap:10px;align-items:start}.consent input{margin-top:5px}.pending-actions{margin-top:14px}.offline-panel li{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:12px;overflow-wrap:anywhere}.offline-panel input:focus-visible,.connected-workspace button:focus-visible,.connected-workspace select:focus-visible{outline:3px solid #f9c23c;outline-offset:2px}
</style>
