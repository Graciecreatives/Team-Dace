# Experience-led FarmBuddy dashboard

## Design direction

Keep the existing Plus Jakarta Sans, forest green `#066136`, sunflower `#F9C23C`, ink `#193D2B`, paper `#FFFFFF` and mist `#F5F6F0`. Use green for actions, yellow for the next useful action and attention, not arbitrary warning backgrounds everywhere. Keep true errors red. Use large readable verbs alongside recognisable icons, not unexplained icon-only navigation. Minimum primary touch targets: 44 CSS pixels. Keep data-entry dialogs focused and optional details progressively disclosed.

The defining idea is **a place for each farming job**, not a universal form template:

| Workspace | Interaction model |
| --- | --- |
| Overview | A visual launchpad: choose what you want to do, then see today's real reminders and recent farm story |
| Production | Season planner, crop/animal identity, dated work timeline |
| Daily work | Action cards and a real open/completed board |
| Sales | Connected harvest, stock, sale and cash workflow |
| Records | Dated farm diary |
| Reminders | Calendar with a focused day agenda |
| Bookkeeping | Money-in/money-out cashbook and actual monthly results |
| Inventory | Supply shelf with explicit quantities and units |
| Crop/herd register | Directory of real enterprises |
| Team | People and access, with explicit roles |
| Notes | Field notebook with saved and device-only states kept distinct |
| Farm Watch | Weather and sourced advisory workspace, never invented forecasts |
| Nearby farmers | Consent-first map and farmer directory |

## References reviewed October 24, 2026

- Farmbrite, Plan features: list, board and calendar project views, team task schedules, crop season planning and animal histories suggest different workspaces for different farming jobs. https://www.farmbrite.com/plan-features
- Linear, Display options: board, list and timeline are different views of the same actual work, rather than decorative graphics. https://linear.app/docs/display-options
- GOV.UK Design System: use researched accessible patterns, keyboard navigation and understandable content. https://design-system.service.gov.uk/
- Scottish Government, Buttons: recognisable icons should directly match their action and label, not be arbitrary decoration. https://designsystem.gov.scot/components/button

These are interaction references, not templates to copy or vendor integrations. No new service is required.

## Acceptance principles

- Real stored data only. Empty states show the next action, not invented results.
- Preserve permissions, account isolation, request cancellation, draft recovery and financial rules.
- Every visible action works or clearly states why it is unavailable.
- No icon or colour is the only way to understand a critical state.
- Responsive at 320 CSS pixels, visible keyboard focus, reduced-motion support.
- Intended to reduce reading and make paths obvious. Do not claim usability for non-readers or children without representative user testing. Voice services still require configuration and supported browser capabilities.

## Validation, October 24, 2026

- 235 isolated regression tests and native Workers crypto checks passed. Focused editor lifecycle tests additionally verify that confirmed saves close only matching unchanged drafts, never unrelated or edited drafts.
- Node production packaging and process-restart persistence checks passed, followed by the Cloudflare Worker production build.
- Actual browser review covered the visual home, season planner and task board. Fourteen feature workspaces were checked at a 358px viewport. A small intrinsic-width overflow in planning was found and corrected. All 16 reviewed dashboard sections also fit the deployed 320px phone preview (317px content viewport) without horizontal page overflow.
- Published Worker version `8e14c224-255a-403e-b8ee-1c81a140731f`. Real HTTPS authentication, D1 journal/version conflicts, connected harvest/stock/cash workflows and private R2 publication checks passed. Only the exact disposable smoke-test account and image were removed afterwards.
- AI, voice and external weather service success is not implied by these checks. Their credentials and external services remain separate configuration requirements.
