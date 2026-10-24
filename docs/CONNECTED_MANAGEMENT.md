# Connected farm management

FarmBuddy now has three connected workspace sections: **Production planning**, **Daily operations**, and **Sales & profit**. **My team** includes actual account access. Existing farm records, inventory, marketplace, notes and bookkeeping remain available.

## Start with the harvest-to-sale workflow

1. In **Inventory**, create a stock item, choosing a clear unit such as kg, trays or litres. Start at zero if no stock exists yet. Do not enter the same opening balance again as a harvest.
2. In **Production planning**, create a crop season or livestock-group management period. Optionally link an existing Crop & herd register entry and plot. Add dates, scheduled activities and observations.
3. In **Sales & profit**, record the harvest/output into that stock item. This adds an immutable production event and stock movement, and increases physical inventory. It does not create income simply because goods were produced.
4. Draft a manual sale with season, stock item, quantity, buyer and NGN unit price. A draft does not reserve stock or record income.
5. **Only after actually receiving payment**, click **Confirm cash received & decrease stock**. One atomic database transaction decreases stock, records a movement and creates the income entry in existing bookkeeping. Insufficient stock rejects the entire command. Retrying a command uses its original ID, and confirming an already-confirmed order does not add a second entry.
6. Print the stable invoice and update delivery as pending, dispatched or delivered with an optional reference. This records your own delivery updates, not live courier tracking.
7. Add season expenses. Reports show recorded income minus recorded expenses for each crop season or livestock-group period, plus unallocated legacy entries and an overall total.

**Accounting boundaries:** this is NGN cash bookkeeping, not accrual accounting, cost-of-goods valuation, payroll, tax calculation or a legally certified tax invoice. Input consumption changes quantity, not money. Record input purchases/expenses separately once, not again each time feed or seed is consumed. The same inventory item may pool output from multiple seasons, so the selected sale season determines financial attribution, not FIFO batch tracing. Confirmed transactions cannot currently be reversed/refunded through this UI. Linked bookkeeping entries cannot be independently deleted, because that would break the workflow history.

**Marketplace boundaries:** public storefronts remain contact-to-order catalogs, not an online checkout or payment gateway. An optional same-farm NGN product may be associated with an order, but this is an explicit order association, not automatic synchronization of legacy storefront quantities. Buyers must contact the farm, and the owner/manager records the sale. Never claim a payment was received just to create an order.

## Production planning

- Plots store 3 to 100 ordered latitude/longitude boundary points with validation. Hectares are entered by the farmer, not calculated or surveyed. These are planning maps, not proof of land ownership.
- Crop seasons and livestock management periods have start/end dates and optional register/plot links.
- A dated schedule supports planting-to-harvest planning. Schedule entries are not automatically assigned team tasks or pushed notifications. Create a Daily operations task when work needs an accountable assignee.
- Histories support planting, observation, health, breeding, feeding and production records, with optional quantities and units. Include animal tags in notes when tracking individual animals within a group. This is a group/history log, not an automatic breeding prediction, electronic tag scanner or dosage calculator.
- Ordinary observations do not change stock. Use the harvest/output workflow to add saleable output, and task input use to consume supplies.
- Maps load only after explicit consent. The selected tile provider receives the device IP and viewed area. Coordinates remain readable without tiles. No Google Maps key is required by the default setup.

## Real team accounts and permissions

The owner creates a private invitation for an email address and a role. Share the token privately yourself. **No email or SMS is automatically sent.** The recipient signs into their own FarmBuddy account with the invited email, accepts the token in My team, then selects the shared farm from Working farm. Tokens are hashed at rest, expire after seven days and can be revoked. A token alone cannot sign someone in or grant access to another email.

| Role | Access in connected workspace |
| --- | --- |
| Owner | Planning, business, task management, stock use, invitations and revocation |
| Manager | Planning, histories, business, tasks and stock use, but not team access management |
| Worker | Read shared planning/tasks/inventory, add observations, complete/reopen their assigned tasks and record stock used against those tasks |
| Viewer | Read shared planning, tasks and quantities, with no mutation or financial report access |

Members only receive these connected workspace permissions. The owner's existing profile, settings, authentication cookies, private legacy notes, raw store and other owner-only APIs are not shared. Team financial views are restricted to owner/manager. Revocation is enforced on every server request, including queued-command replays. The old contact roster is preserved separately under a clearly labelled legacy section, and does not grant account access.

Tasks can be unassigned or assigned to an active owner, manager or worker account, with a due date and optional season. Input use requires positive available stock and an open task. Workers can only update their own assigned tasks. Usage is recorded with actor, task and season references. Manually editing a linked inventory row requires the current version to prevent overwriting a concurrent harvest, sale or input-use update.

## Offline support beyond notes

On a trusted device, opt into **Offline field capture**. This can cache the selected workspace and retain drafts for observations, harvest/output, task completion and input usage. Review the pending list and press Sync when connected. There is no background auto-sync, no speculative server stock adjustment and no financial posting before successful server confirmation.

- Draft IDs survive retries to prevent duplicate stock movements.
- Draft storage is scoped by signed-in account and farm. Changing accounts clears the visible state and invalidates late responses.
- Permissions, current task assignment and available stock are rechecked during sync. Conflicts pause sync. Discarding a device draft never undoes a command that already reached the server.
- Device storage is not encrypted. Use a trusted browser, especially when caching shared-farm data. A revoked user's previously downloaded data cannot be remotely erased from an offline device.
- Storage failure is reported and the in-memory draft remains in the open page. Copy important details before leaving.
- This is offline field capture in an already-loaded app, not a fully offline-installable PWA. First loading or reloading the app and authenticating may require a connection. Online business requests with uncertain outcomes retain a same-ID retry while the page remains open.

## Environment and database rollout

Use `.env.example` and `docs/CLOUDFLARE.md` for configuration. These workflows need no additional third-party API keys. They persist in the private D1 snapshot in `farmWorkspaces`, alongside canonical inventory and bookkeeping arrays.

Legacy snapshots without `farmWorkspaces` gain an empty optional collection in memory without losing existing data. Present non-array values are rejected, not silently overwritten. Cloudflare D1 uses revision compare-and-swap to commit connected operations atomically. Provisioning and one-time non-overwriting migration are described in `docs/CLOUDFLARE.md`. Do not re-import over an initialized database.

## Validation

`npm test` includes domain validation, role/invitation cases, offline utility and actual composable lifecycle tests, and a real local HTTP cross-account workflow with concurrent duplicate harvests, sale retries, negative-stock rejection, seasonal profit, legacy ledger protection and revocation. `npm run build && npm run test:production` tests packaged routes and a real process restart with linked stock and cash reports. Tests use disposable local data and synthetic/disabled external services, not live provider credentials.
