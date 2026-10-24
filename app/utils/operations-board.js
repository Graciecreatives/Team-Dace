export const emptyTask = () => ({ title: '', dueOn: '', assigneeId: '', seasonId: '' })
export const emptyInvite = () => ({ email: '', role: 'worker' })
export const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export const snapshot = value => JSON.parse(JSON.stringify(value))
export function canUpdateTask(state, task) {
  const role = state.farm?.role
  return ['owner', 'manager'].includes(role) || (role === 'worker' && !!state.currentUserId && task.assigneeId === state.currentUserId)
}
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function isOverdue(task, today = localToday()) {
  return !task.completed && !!task.dueOn && task.dueOn < today
}
export function filterTasks(tasks, filters, members = []) {
  const query = filters.search.trim().toLowerCase()
  return tasks.filter(task => (!filters.assignee || (filters.assignee === 'unassigned' ? !task.assigneeId : task.assigneeId === filters.assignee)) && (!filters.season || (filters.season === 'none' ? !task.seasonId : task.seasonId === filters.season)) && (!query || [task.title, members.find(member => member.userId === task.assigneeId)?.name].some(value => value?.toLowerCase().includes(query))))
}
export const taskColumns = tasks => [{ id: 'open', title: 'Open', items: tasks.filter(task => !task.completed) }, { id: 'completed', title: 'Completed', items: tasks.filter(task => task.completed) }]
export function stockLimit(inventory, id) {
  const quantity = inventory.find(stock => stock.id === id)?.quantity
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}
export function validConsumption(inventory, draft) {
  const quantity = Number(draft?.quantity)
  return quantity > 0 && quantity <= stockLimit(inventory, draft?.inventoryId) && /^\d+(?:\.\d{1,6})?$/.test(String(draft?.quantity))
}
export function matchesReceipt(pending, state) {
  if (!pending || !state.lastCommandId || state.lastCommandId === pending.before || state.result?.action !== pending.action) return false
  const result = state.result
  if (pending.action === 'tasks.consume' || pending.action === 'tasks.complete') return result.taskId === pending.id
  if (pending.action === 'team.remove') return result.removed === pending.userId
  if (pending.action === 'team.revoke') return result.invitationId === pending.id
  if (pending.action === 'tasks.create') return !!result.taskId
  if (pending.action === 'team.invite') return !!result.token
  return pending.action === 'team.accept' && !!result.farmId
}
