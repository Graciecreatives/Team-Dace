# FarmBuddy

### Smart AI Farming Management System

FarmBuddy helps crop, livestock and mixed farmers plan work, manage resources, keep business records and reach buyers through their own shareable online shop.

It is a responsive, full-stack web application built with **Nuxt, Vue and Cloudflare**, bringing the field, the farm team and the farm business into one workspace.

## Why FarmBuddy?

Farm work is often tracked across notebooks, messages, photos and separate tools. Farmers need a practical way to answer everyday questions: What needs attention? Who is doing the work? What stock is left? What did we sell or spend? Where can buyers see our products?

FarmBuddy connects these activities instead of treating planning, stock, sales and advice as unrelated tools.

## Features

| Area | Capabilities |
|---|---|
| Farm workspace | Account registration, onboarding, crop/livestock/mixed dashboards and farm settings |
| Production planning | Crop and herd registers, mapped plots, seasons, schedules and dated production events |
| Daily operations | Assigned tasks, due dates, completion tracking and permitted supply consumption |
| Collaboration | Owner-controlled invitations and manager, worker and viewer permissions |
| Inventory | Quantities, units, low-stock thresholds, expiry indicators and stock movements |
| Harvest and sales | Harvest-to-stock updates, sale drafts, confirmed paid-sale stock/income updates, printable invoices and delivery tracking |
| Bookkeeping | Income, expenses, activity records, reminders, filters, CSV export and seasonal summaries |
| Farmer-owned shop | Customizable storefront, product photos, descriptions, prices, quantities and a shareable shop link |
| Buyer enquiries | Published catalog, enquiry basket, estimated totals and copyable enquiry summary |
| FarmBuddyAI | Farming questions, optional operational farm context and curated reference retrieval |
| Voice | Microphone transcription, editable transcripts, reviewed voice-to-record and optional read-aloud |
| Plant tools | Plant identification and limited possible disease/pest suggestions through Pl@ntNet |
| Farm Watch | Five-day forecasts, planning prompts, sourced health bulletins and optional visit-time notifications |
| Maps | Plot mapping, road maps and dated broad-area satellite context |
| Farmer connections | Opt-in approximate discovery, requests, acceptance and blocking |
| Field capture | Account-scoped offline notes and selected operational drafts with reconciliation |

### Your farm becomes your shop

Farmers can publish products and post their own shop link on social media or send it directly to customers. Buyers browse published listings and prepare enquiries. Payment and delivery are arranged with the farmer outside the platform, not through an integrated checkout.

### Connected harvest-to-cashbook workflow

1. Create a season and inventory item.
2. Record a harvest to increase the selected stock.
3. Create a sale draft without changing stock or income.
4. Explicitly confirm a paid cash sale to update stock and income together.
5. Review recorded seasonal costs and sales, print an invoice and update delivery status.

Duplicate confirmations are guarded against repeated effects. Recording a paid sale does **not** collect a payment.

## Technology stack

| Layer | Technology |
|---|---|
| Full-stack application | Nuxt 4, Vue 3, JavaScript ES modules |
| Server APIs | Nitro and H3 |
| UI | Tailwind CSS, custom FarmBuddy components, Reka UI, Lucide icons |
| Hosting | Cloudflare Workers and static asset binding |
| Production data | Cloudflare D1 |
| Product and cover photos | Private Cloudflare R2, Photon WebAssembly image processing |
| AI chat | Cloudflare Workers AI, `@cf/openai/gpt-oss-120b` |
| Transcription | Workers AI, `@cf/openai/whisper-large-v3-turbo` |
| Optional spoken replies | YarnGPT |
| Plant identification | Pl@ntNet |
| Optional experimental cattle screening | Roboflow, disabled by default |
| Forecasts | OpenWeather five-day/three-hour API |
| Maps and imagery | Leaflet, OpenStreetMap, NASA GIBS |
| Health information | EPPO and WOAH source adapters |
| Authentication | Application-owned accounts, scrypt password hashing, server-side sessions |
| Tooling and tests | Node.js, npm, Wrangler, Node test runner, Vue compiler/component checks and integration scripts |

Production uses **D1 and application-owned authentication**, not Supabase. The retained `supabase/` directory is not the active production backend.

## Getting started

Use a Node.js version supported by the locked Nuxt toolchain, with npm available. Node.js 22.12+ is a suitable baseline. A Cloudflare account is not required for basic local development.

```sh
git clone https://github.com/Graciecreatives/Team-Dace.git
cd Team-Dace
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`, register an account and complete farm onboarding. Local development uses a local JSON data store and local image storage by default. No sample farmers or business activity are required to use the app.

For access from another device on your network:

```sh
npm run host
```

Microphone access normally requires **HTTPS or localhost**. A phone opening a plain HTTP LAN address may not be able to record audio.

### Environment configuration

Use `.env.example` as the configuration reference. Keep `.env`, `.dev.vars`, local data, credentials and uploaded photos out of Git.

| Variable | Purpose |
|---|---|
| `FARMBUDDY_AUTH` | Local or Cloudflare-backed application authentication mode |
| `FARMBUDDY_DATABASE` | Local JSON or Cloudflare D1 persistence mode |
| `FARMBUDDY_IMAGE_STORAGE` | Local files or Cloudflare R2 image mode |
| `FARMBUDDY_DATA_FILE` | Optional private local data-file location |
| `FARMBUDDY_UPLOAD_DIR` | Optional private local upload-directory location |
| `PLANTNET_API_KEY` | Optional plant identification and limited screening |
| `YARNGPT_API_KEY`, `YARNGPT_VOICE` | Optional spoken answers |
| `OPENWEATHER_API_KEY` | Optional live forecasts |
| `ROBOFLOW_API_KEY` | Optional experimental cattle screening provider |
| `FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN` | Explicit experimental enable flag, default `false` |
| `NUXT_PUBLIC_MAP_TILE_URL`, `NUXT_PUBLIC_MAP_ATTRIBUTION` | Public road-map configuration, never secret keys |

Native chat and transcription use the private Cloudflare `AI` binding. They do not require a chat API key in `.env`. Plain `npm run dev` has no Workers AI binding, so native AI features report unavailable while other tools remain usable.

### Cloudflare development and deployment

Read [Cloudflare setup](docs/CLOUDFLARE.md) before provisioning or deploying. The checked-in `wrangler.jsonc` identifies the existing deployment. If deploying your own instance, configure **your own** account, Worker, D1 database and R2 bucket rather than writing to another deployment.

Required bindings:

- `FARMBUDDY_DB`: initialized D1 application store.
- `FARMBUDDY_IMAGES`: private R2 photo bucket.
- `AI`: Workers AI inference.
- `ASSETS`: built static assets.

After authentication, provisioning and explicit database initialization following the guide:

```sh
# Prepare local provider secrets and start a Worker preview
npm run cf:dev

# Inspect optional provider-secret synchronization without applying it
npm run cf:secrets

# Explicitly upload configured optional provider secrets
npm run cf:secrets -- --apply

# Build and deploy to the configured Cloudflare Worker
npm run cf:deploy
```

**Cost notice:** `cf:dev` uses real remote Workers AI inference, subject to account quota and charges. External providers may also have usage costs. Do not use production data for tests or overwrite an initialized database to set up a preview.

## Testing and builds

```sh
# Domain, API, component and runtime regression tests
npm test

# Build the Node production application
npm run build

# Test the built Node application with isolated test data
npm run test:production

# Build the Cloudflare target
npm run build:cloudflare

# Database-specific tests
npm run test:database
```

Run the Node production test after `npm run build`, not after the Cloudflare build. Avoid concurrent Nuxt development/build processes because they share generated output directories. The core regression and Node production tests do not require live paid AI inference.

## Project structure

```text
app/                    Vue pages, components, UI and client utilities
server/                 Nitro API routes, domain logic, persistence and tests
cloudflare/             Worker entry point and runtime integration
scripts/                Test, database and secret-management tooling
tests/                  Domain, API, security and UI regression tests
docs/                   PRD, architecture, setup and acceptance documentation
presentations/farmbuddy/ HTML presentation and assets
public/                 Public static assets
wrangler.jsonc          Cloudflare deployment and binding configuration
.env.example            Safe local configuration template
```

## Privacy, safety and current boundaries

- Private farm records are separate from published shop content. Server-side ownership and role checks govern access.
- Shop publication, contact visibility, discovery, location access, microphone use and operational AI context require explicit user decisions.
- Voice transcripts remain editable drafts. Review and explicit action are required before sending or saving. This tool does not save audio.
- Product and cover images are validated, resized and re-encoded with EXIF/GPS metadata removed. R2 objects remain private behind application access rules.
- AI advice and possible image matches are not professional diagnoses. Experimental cattle screening is disabled by default and is not clinically validated.
- Offline support covers notes and selected drafts, not the entire application. Browser storage is unencrypted and may remain after logout.
- Weather prompts are planning aids. Sourced health bulletins are not verified hyperlocal outbreak detection, and monitoring does not continue after closing the dashboard.
- Shop enquiries do not collect payment, reserve stock or arrange shipping automatically. Cash balance is recorded income minus expenses, not full accounting profit.
- Current D1 persistence is a revision-checked application snapshot with a **global 1,000,000-byte limit**. Normalized high-growth storage and further operational hardening are needed before significant scale.

## Documentation

- [Product requirements](docs/PRD.md) and [editable Word PRD](docs/FarmBuddy-PRD.docx)
- [Project description for judges](docs/JUDGES_PROJECT_DESCRIPTION.md)
- [Features and setup](docs/FEATURES_AND_SETUP.md)
- [Cloudflare provisioning and deployment](docs/CLOUDFLARE.md)
- [Connected management workflows](docs/CONNECTED_MANAGEMENT.md)
- [AI farm context](docs/AI_FARM_CONTEXT.md)
- [Plant vision and limitations](docs/SPECIALIST_VISION.md)
- [Experimental animal screening](docs/ANIMAL_VISION.md)
- [Product photos](docs/PRODUCT_PHOTOS.md)
- [Farm Watch maps](docs/FARM_WATCH_MAP.md)
- [UI components](docs/UI_COMPONENTS.md)

## Contributing

Keep changes focused, add regression coverage for behavior changes and run the relevant tests before submitting a pull request. Never include provider secrets, private farm data or runtime storage in commits. Check implementation and current configuration before presenting a planned feature as shipped.

---

**FarmBuddy connects the field, the farm team and the farm business.**
