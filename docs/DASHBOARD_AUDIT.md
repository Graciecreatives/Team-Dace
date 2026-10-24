# FarmBuddy dashboard audit

Reviewed October 24, 2026. This distinguishes implemented workflows from features that require external configuration or are not implemented. A visible menu item is not proof that an external service is connected.

## Sidebar feature map

| Sidebar | What it does | Status and limits |
|---|---|---|
| Overview | Income, expenses, balance, recent activity and upcoming reminders | Reads actual account records. Does not invent farm yield or predictions. |
| Production planning | Plots, optional field boundary map, seasons, schedules and crop/animal histories | Persistent and permission checked. Map needs explicit external tile consent. Boundaries are entered, not surveyed or automatically measured. |
| Daily operations | Assign tasks to actual members, complete/reopen tasks and record stock consumption | Real Open/Completed board plus list view, assignee/season/search filters. No fake In Progress state or decorative drag-and-drop. Stock use is validated server-side. |
| Sales & profit | Harvest into stock, draft orders, cash confirmation, invoices, delivery states and seasonal reports | Connected harvest → stock → confirmed sale → stock reduction → bookkeeping. Draft orders reserve no stock. No online payment processing. |
| Farm records | Save activities, income and expenses | Persistent, account scoped. Financial entries feed bookkeeping. |
| Bookkeeping | Income, expenses and cash balance | Cash records, not full double-entry accounting, tax filing or bank reconciliation. |
| Reminders | Dated tasks and completion | In-app only. No background push, SMS or email delivery. |
| Crop & herd register | Crop/livestock enterprise quantities, dates and notes | Saved private register with search and type filters. Detailed history lives in Production planning. |
| Inventory | Physical supplies/produce, quantities, low-stock thresholds and expiry | Searchable stock workspace. Manual adjustments do not create money entries. Connected harvests, task consumption and confirmed sales update stock. |
| Marketplace | Product photos, publishing, public farm link and store customization | Real R2 photo uploads and public storefront. Buyers build enquiries and contact farmer. No checkout, payment collection or automatic shipping booking. Storefront quantities are not silently linked to unrelated inventory items. |
| My team | Email-bound invitations, actual member roles, join/revoke access | Owner controls access. Manager, worker and viewer permissions checked on server. Invitation token must be shared privately. No invitation email is sent. Legacy contact roster alone grants no access. |
| Offline notes | Private device drafts with explicit sync | Opt-in and account scoped. Not a fully offline installable app. Workspace also supports selected field commands, with stable replay IDs. |
| FarmBuddyAI | Text advice, eligible photo guidance, browser dictation and spoken replies | **Live status on October 24: chat=false, photo=false, voice=false.** Worker secret list is empty. Requires OpenRouter/YarnGPT configuration, not a UI redesign. No chats or images sent to a paid provider during this audit. |
| Farm Watch | Location-based forecast planning and sourced plant/animal health bulletins | Forecast needs OPENWEATHER_API_KEY. Location and external requests require consent. Bulletins are sourced information, not verified nearby disease cases or emergency diagnosis. No background notification delivery. |
| Nearby farmers | Opt-in approximate location, nearby search, connection requests, contact privacy and map | Real account-backed network, not seeded fake farmers. Map tiles require opt-in. Empty results can mean nobody nearby has opted in. Contact details are not public before permitted connection. |
| My farm | Current farmer/farm profile | Read-only summary. Edit through Settings. No independently verified bank-ready farm passport. |
| Settings | Edit account/farm profile and sign out | Persistent profile updates. No managed email verification, password recovery or automatic AI-key setup. |

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

Focused tests execute actual Vue setup logic for loading, permissions, drafts, account switches, stale responses, busy guards and failures. Shared components compile and render with real Vue/Reka on the server. Existing HTTP tests cover connected stock, financial idempotency, permissions, auth and image privacy. Browser, full build and deployed acceptance results are recorded below once completed.
