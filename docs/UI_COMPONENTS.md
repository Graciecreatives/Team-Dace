# FarmBuddy UI component library

## Decision

Use a small FarmBuddy-owned visual layer over **Reka UI**, not a second application theme. Existing Tailwind 3 and the green/yellow Plus Jakarta Sans design remain intact. Reka supplies unstyled accessible Vue primitives for focus management, modal dialogs and keyboard tabs. Buttons, panels, fields, badges and boards are intentionally small native components.

Research reviewed October 24, 2026 using official documentation:
- https://reka-ui.com/docs/overview/introduction
- https://reka-ui.com/docs/components/dialog
- https://reka-ui.com/docs/components/tabs
- https://ui.nuxt.com/docs/getting-started/migration/v3

Nuxt UI was considered but its documented Tailwind 4 migration would broaden this task unnecessarily. Reka can be adopted incrementally without replacing the existing site's visual language. No third-party Kanban demo or incompatible drag library was installed.

## Components

All components are in `app/components/ui`. Import them explicitly from feature components. Global styling is registered in `nuxt.config.js` from `app/assets/css/components.css`.

| Component | Contract |
|---|---|
| FbButton | `variant`: primary, secondary, ghost, danger. `busy`, `disabled`, `type`. Native attributes/events and default slot. Busy disables duplicate interaction and exposes aria-busy. |
| FbBadge | `tone`: neutral, success, warning, danger. Default text slot. |
| FbPageHeader | `title`, `description`, optional `#actions`. Compact workspace heading. |
| FbPanel | Optional `title`, `#header`, `#actions` and default content. Rounded inner panel, not a narrow outer page container. |
| FbEmptyState | `title`, `description`, optional action slot. Separate empty, filtered-empty and failed-load states in features. |
| FbField | `label`, `for`, `hint`, `error`, input slot. Caller supplies unique input ID matching `for`. |
| FbBoard | `columns: [{id,title,items}]`, accessible `label`, scoped `#item={item,column}`. Counts and responsive columns. It renders actual server states, not invented statuses. |
| FbDialog | `v-model:open`, `title`, `description`, `busy`, default content and optional `#footer`. ReKa focus trap/portal, labelled title/description, Escape/outside close, return focus. Busy blocks dismissal. |
| FbTabs | `v-model`, `items: [{value,label,count?,disabled?}]`, `label`; named content slot matching each item value. Reka keyboard/roving focus support. |

Use `.fb-input` for native text fields, selects and textareas. Keep validation beside the field or form and preserve input on request failure. Use fieldsets disabled while saving if edits cannot be safely retained. Do not rely on color alone to convey status.

## Design rules

- Forest green `#066136`, yellow `#F9C23C`, ink `#193D2B`, mist `#F5F6F0`, white surfaces.
- Inherit Plus Jakarta Sans from the site. Do not introduce serif headings or a competing theme.
- Workspaces use available dashboard width. Inner cards use rounded corners and subtle borders.
- Progressive disclosure for long explanations. Focused editors instead of permanent multi-screen forms.
- Visible keyboard focus, native form semantics, explicit destructive confirmation and reduced-motion support.
- Boards are Open/Completed because those are the persisted task states. Any future drag interaction must retain keyboard controls, permission checks and server persistence.

## Verification

`app/tests/ui-library.test.mjs` compiles every shared SFC and server-renders with actual Vue/Reka. Feature tests cover task board filters, state transitions, member permissions, inventory editors, numeric validation, stale responses, offline storage failures and receipt-safe drafts. Browser acceptance must additionally check actual dialog focus, Escape/close behavior, tab keyboard navigation, mobile layout and real API persistence.
