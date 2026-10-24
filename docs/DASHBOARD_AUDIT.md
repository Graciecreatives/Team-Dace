# FarmBuddy dashboard audit

Reviewed October 24, 2026. This distinguishes implemented workflows from features that require external configuration or are not implemented. A visible menu item is not proof that an external service is connected.

## Sidebar feature map

| Sidebar | What it does | Status and limits |
|---|---|---|
| Overview | Income, expenses, balance, recent activity and upcoming reminders | Reads actual account records. Does not invent farm yield or predictions. |
| Production planning | Plots, optional field boundary map, seasons, schedules and crop/animal histories | Persistent and permission checked. Map needs explicit external tile consent. Boundaries are entered, not surveyed or automatically measured. |
| Daily operations | Assign tasks to actual members, complete/reopen tasks and record stock consumption | Real Open/Completed board plus list view, assignee/season/search filters. No fake In Progress state or decorative drag-and-drop. Stock use is validated server-side. |
| Sales & profit | Harvest into stock, draft orders, cash confirmation, invoices, delivery states and seasonal reports | Connected harvest → stock → confirmed sale → stock reduction → bookkeeping. Draft orders reserve no stock. No online payment processing. |
| Farm records | Searchable journal with category/date filters and manual record editing | Account-scoped create/edit/delete with version conflicts. Linked workflow entries remain read-only. Financial entries feed bookkeeping. |
| Bookkeeping | Cash ledger, period summaries, monthly chart/table and filtered CSV | Manual entry editing shares the records API. Currency-safe CSV escaping and explicit download feedback. Cash records, not full double-entry accounting, tax filing or bank reconciliation. |
| Reminders | Calendar/list views, due-date filters, overdue counts, edit/delete and complete/reopen | Civil-date calendar with keyboard navigation. In-app only. No background push, SMS or email delivery. |
| Crop & herd register | Crop/livestock enterprise quantities, dates and notes | Saved private register with search and type filters. Detailed history lives in Production planning. |
| Inventory | Physical supplies/produce, quantities, low-stock thresholds and expiry | Searchable stock workspace. Manual adjustments do not create money entries. Connected harvests, task consumption and confirmed sales update stock. |
| Marketplace | Product photos, publishing, public farm link and store customization | Real R2 photo uploads and public storefront. Buyers build enquiries and contact farmer. No checkout, payment collection or automatic shipping booking. Storefront quantities are not silently linked to unrelated inventory items. |
| My team | Email-bound invitations, actual member roles, join/revoke access | Owner controls access. Manager, worker and viewer permissions checked on server. Invitation token must be shared privately. No invitation email is sent. Legacy contact roster alone grants no access. |
| Offline notes | Private device drafts with explicit sync | Opt-in and account scoped. Not a fully offline installable app. Workspace also supports selected field commands, with stable replay IDs. |
| FarmBuddyAI | Text advice, eligible photo guidance, browser dictation and spoken replies | **Live status on October 24: chat=false, photo=false, voice=false.** Worker secret list is empty. Requires OpenRouter/YarnGPT configuration, not a UI redesign. No chats or images sent to a paid provider during this audit. |
| Farm Watch | Location-based forecast planning and sourced plant/animal health bulletins | Forecast needs OPENWEATHER_API_KEY. Location and external requests require consent. Bulletins are sourced information, not verified nearby disease cases or emergency diagnosis. No background notification delivery. |
| Nearby farmers | Opt-in approximate location, nearby search, connection requests, contact privacy and map | Real account-backed network, not seeded fake farmers. Map tiles require opt-in. Empty results can mean nobody nearby has opted in. Contact details are not public before permitted connection. |
| My farm | Current farmer/farm profile | Read-only summary. Edit through Settings. No independently verified bank-ready farm passport. |
| Settings | Farm profile, sign out and connected-service configuration cards | Cards are authenticated, no-store booleans only. Configured does not mean a live provider request succeeded. No managed email verification, password recovery or automatic AI-key setup. |

## Defects fixed in this change

- Device storage failures previously allowed a false “draft saved” message. Queue writes now succeed before the app reports persistence. Failed discard/removal does not pretend private device data was removed.
- Inventory/register requests now invalidate old account/section responses, abort on context changes and unmount, and keep drafts on save conflicts/failure. Blank quantities are not silently converted to zero.
- Nearby-farmer requests and geolocation callbacks are scoped to account, mode and current request. Switching context cannot repopulate stale profile/map results.
- Task editors use submitted snapshots and matching receipts so a response does not erase new typing. Team access revocation has explicit confirmation and clipboard failures are reported honestly.
- Sales drafts use receipt-aware clearing instead of resetting unrelated or subsequently edited drafts.
- Operations, stock/registers, team and sales workspaces can use the available dashboard width rather than nesting inside a narrow outer card.

## What still needs configuration or further development

1. Set private Worker secrets for OPENROUTER_API_KEY, YARNGPT_API_KEY and OPENWEATHER_API_KEY through the existing secret tooling. Optional model/voice settings are documented in .env.example. Never put these in public Nuxt variables or commit .env.
2. Text-to-speech and browser speech recognition are different: YarnGPT speaks replies; browser dictation support depends on browser, permissions and language support.
3. Custom OpenRouter models remain text-only unless their image capability is explicitly supported. Photo guidance is not a veterinary/agronomic diagnosis.
4. Payments, full accounting, automatic courier dispatch, email/SMS/push notifications and a verified farm passport are not implemented.
5. The D1 snapshot store has a documented size/concurrency boundary. A normalized data model and pagination are future scale work, not claimed here.
6. Existing dependency audit reports 21 vulnerabilities. No breaking force-upgrade was applied as part of a UI change.

## Verification scope

Focused tests execute actual Vue setup logic for loading, permissions, drafts, account switches, stale responses, busy guards and failures. Shared components compile and render with real Vue/Reka on the server. Existing HTTP tests cover connected stock, financial idempotency, permissions, auth and image privacy. Browser, full build and deployed acceptance results are recorded below.

### Completed local acceptance

- Full isolated regression: 171 tests passed, plus the separate native Workers crypto test. HTTP suites reported 185 auth/storage checks, 38 weather/community checks and 37 marketplace checks.
- Node production build and real process-restart integration passed. Cloudflare Worker build passed.
- Browser used only a disposable local preview account: created 20 kg stock, created a task, completed/reopened it, recorded 2 kg input use and read back exactly 18 kg from the actual API.
- Inventory dialog: labelled content, focus inside, Escape dismissal and return focus to Add supply passed. At a 320 px viewport its bounds stayed inside the viewport and the document had no horizontal overflow.
- Task board columns stacked at 320 px without horizontal overflow. Sales tabs supported arrow-key focus and Enter activation, with only the active entry form mounted.
- Live AI status and Worker secret names were checked without exposing credentials. No provider keys were present locally or remotely, so live AI/voice/weather provider success is not claimed.
- Invalid-store messages in isolated corruption tests are expected injected failures, not evidence that live user data was changed or repaired.

### Deployed acceptance

- Published to the existing Cloudflare Worker, version `5ab035b5-dc0b-4f70-b9ae-be3d83d2595a`.
- Live browser confirmed the Create task action, full-width operations workspace and inherited Plus Jakarta Sans typography. Existing demo data was not edited.
- Live HTTPS smoke passed authentication, D1 harvest/stock/sale/bookkeeping replay, session persistence, CSRF and private/public R2 photo/custom-cover boundaries.
- Exactly the disposable smoke account and its one photo were removed after verification. Other account data was preserved.

### Production, journal and reporting upgrade

- Published October 24, 2026 as Worker version `0c0f7d06-80bb-4b13-95a1-c8e9bf8a9517`.
- Full isolated suite: **203 tests passed**, plus the separate native Workers crypto test. Node production build, real process restart and Cloudflare build passed.
- Disposable local browser workflow created a manual expense, edited it from NGN1,250 to NGN1,500 in the journal, then NGN1,750 from bookkeeping. The monthly report showed exactly NGN1,750 expenses and negative NGN1,750 net recorded cash. Filtered CSV download was requested successfully.
- Browser created and edited a reminder, completed/reopened it, selected its calendar date, used arrow-key date focus and deleted it through the confirmation dialog.
- Browser created a crop season, scheduled seedling inspection and saved a real observation. Each appeared in the actual persisted production workspace.
- Calendar, bookkeeping and confirmation dialog fitted a 320px iframe viewport (316px inner width) without document overflow. The deletion dialog stayed within the viewport.
- Live browser confirmed the full-width journal and reminder calendar. Settings accurately displayed Setup needed for unconfigured services. No live AI/voice/weather success is claimed.
- Expanded live HTTPS smoke passed versioned record/reminder CRUD, stale-edit conflict, authenticated no-store service status, D1 harvest/sale bookkeeping, R2 photo/cover privacy and login persistence. Exactly its disposable account and one photo were cleaned up, preserving other data.
- Production records are create-and-review histories in this release. Existing schedules are not a drag-and-drop editable calendar. Reminders have edit/delete, but no background notifications. These limits are intentional and are not presented as working integrations.
