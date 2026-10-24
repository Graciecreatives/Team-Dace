# FarmBuddy features and setup

## Available dashboard tools
- Crop/herd registers with quantity, unit, start date, notes, editing, and confirmed deletion.
- Inventory with editable quantities, low-stock thresholds, expiry indicators, and confirmed deletion.
- Offline notes saved in account-scoped browser storage before upload. Reconnecting retries the queue with idempotent UUIDs. Notes are immutable after saving to avoid silent offline edits overwriting newer content. Copy to a new draft to revise.
- Voice-to-record inside **FarmBuddyAI** uses microphone recording and the existing Cloudflare Workers AI transcription endpoint when configured, including on browsers without Web Speech recognition such as Firefox. Supported browser speech services remain a fallback, and typed/pasted transcripts are always available. Stop finalizes the recording before transcription. The farmer reviews the category, title, amount, and note before saving. No money is inferred from speech. Confirmed income/expenses also appear in Bookkeeping.
- Bookkeeping shares the existing persistent farm records: income and expense entry, monthly/all-time totals, search/type filters, and filtered CSV export. Activities are excluded from financial totals. The cash balance is recorded income minus recorded expenses, not a full accounting profit calculation. Entry dates currently use their saved timestamp.
- Expert referrals and standalone Voice records have been removed from dashboard navigation. Existing referral data is retained, not deleted.
- **Farm Watch** replaces Weather planning: explicitly permitted device location or manual rounded coordinates, real five-day weather, farm-profile-aware planning prompts, sourced plant/animal health bulletins, and an unread notification centre. Updates refresh while the dashboard is open and visible after an area is selected. Optional browser notifications require a separate permission click. There is no background push or SMS.
- Real farmer discovery from opted-in FarmBuddy accounts, approximate area maps, connection requests, explicit acceptance before sharing contact details, and blocking. There are no fabricated farmers and no in-app farmer chat.
- Specialist **Plant scanner** inside FarmBuddyAI: up to five same-plant photos, plant-part choices, species/taxonomy and limited disease/pest suggestions through Pl@ntNet. Add `PLANTNET_API_KEY`. See `docs/SPECIALIST_VISION.md` for evidence and coverage limits.
- Optional, disabled-by-default experimental cattle photo screening through Roboflow, with model-highlighted areas rather than diagnostic claims. Requires a separate private key and explicit operator flag. See `docs/ANIMAL_VISION.md` for small-dataset limitations and metered provider usage.
- Farm Watch area map: dated NASA satellite imagery, road view, approximate forecast-area point and explicit load/unload. No automatic geolocation or claim of field-level disease detection. See `docs/FARM_WATCH_MAP.md`.
- Configurable AI chat, photo-based plant/animal guidance, crop identification, and YarnGPT spoken answers. The UI reports whether providers are configured.

## Run locally
```sh
npm install
npm run dev
```
Visit localhost port 3000. Register, complete onboarding, and open a tool from the dashboard sidebar. Existing users without onboarding are asked to complete it. Crops route to `/dashboard/crops`, livestock/poultry to `/dashboard/livestock`, and mixed farms to `/dashboard`.

## Enable AI and voice
1. Cloudflare supplies chat through the private `AI` binding in `wrangler.jsonc`. No chat API key is needed in `.env`. The deployed Worker uses `FARMBUDDY_AI_MODEL=@cf/openai/gpt-oss-120b`.
2. For local native chat use `npm run cf:dev`, which uses real remote Workers AI inference and your account quota. Plain Nuxt `dev` / `host` has no AI binding and reports chat unavailable. This text model does not accept photos. Use the separate specialist scanners for supported photo tasks.
3. Add optional `YARNGPT_API_KEY` and `YARNGPT_VOICE` to private `.env`. Voice may be blank for the provider default. Upload external secrets with `npm run cf:secrets -- --apply`. Change production model configuration in `wrangler.jsonc` and redeploy.
4. Open FarmBuddyAI. Sending a question shares selected farm profile fields, conversation context and optionally selected operational records with Cloudflare Workers AI. Farm records remain opt-in.
5. Read aloud shares the answer text with YarnGPT and returns audio. Native microphone recording sends audio to Cloudflare Workers AI for transcription after Stop. Where native transcription is unavailable, a supported browser speech service can provide dictation separately. Language accuracy varies by browser/service. No microphone is opened automatically, and speech is never sent as a question or saved as a record without review.

Active dictation shows animated bars, an elapsed-time counter and a Stop action. These bars are an activity indicator, not measured microphone levels. The active indicator starts only when the browser reports that listening has begun, not while permission is pending. Reduced-motion preferences disable the animation. Transcript entry remains editable and must be reviewed before sending or saving. Browser speech availability depends on browser support and microphone permissions, and phone microphone access may require an HTTPS deployment rather than a plain-HTTP LAN preview.

## Dashboard settings

The sidebar footer now shows the farmer's initials, name and Farm owner label and opens My farm. The promotional footer/homepage link is removed. Settings edits farm name, type, crops/animals, location and language preference through the authenticated profile API. A farm-type change redirects to the matching dashboard without moving records to another account. Name/email are read-only and the language field is a preference, not automatic app translation. Sign-out is now in Settings instead of the sidebar footer.

Provider requests may incur charges. The app does not sign up, top up, purchase credits, or test live paid AI calls automatically. API keys remain server-side. Rate limits and bounded uploads are implemented, but production still needs account-level budgets, monitoring, and abuse controls.

## Weather and maps
- Weather checks use entered or explicitly requested device coordinates, rounded to 0.1° before requesting the forecast. They do not automatically publish a farmer profile.
- Set `OPENWEATHER_API_KEY` in the server environment to an OpenWeather FREE five-day / three-hour forecast key. Do not put it in public runtime config or a `NUXT_PUBLIC_` variable. Missing configuration returns HTTP 503, with no fake or keyless fallback. This uses only `https://api.openweathermap.org/data/2.5/forecast` with rounded `lat`, `lon`, `units=metric`, and server-only `appid`, never the paid One Call API. No live or paid calls are needed for tests.
- Forecast periods are grouped by the provider's fixed UTC offset. Temperatures are available-period extrema, rain is the sum of `rain.3h` (absent rain means no rain, not snow), humidity is the mean and wind the maximum speed in m/s. Missing optional humidity/wind stays unavailable. Partial days and missing intervals are labelled, not extrapolated to daily totals. The five-day horizon may span six calendar dates.
- Requests reject redirects, time out after 10 seconds including body reading, and cap responses at 256 KiB. Provider errors are sanitized without URLs, keys, or upstream bodies. Cache entries contain only normalized forecast data.
- Weather data provided by OpenWeather, with a visible provider link and CC BY-SA 4.0 license link. FarmBuddy aggregates the data and adds planning notes. Review OpenWeather's open-license/ODbL share-alike and logo attribution requirements before public distribution (https://openweathermap.org/faq).
- Planning indicators use available-period maximum temperature at least 35°C or summed rain at least 20 mm, with cold prompts at 2°C or below. These are illustrative planning thresholds, not crop-specific safety limits, full-day extrema, or a guarantee that other hazards are absent. OpenWeather documentation and free access pricing were checked October 24, 2026.
- Weather is cached server-side for 15 minutes by rounded area. No forecast is fabricated on provider failure.
- Farmer discovery is hidden by default. Publishing requires a public farm name, rounded coordinates, and explicit consent. Location permission is optional, with manual coordinate entry available.
- Interactive Leaflet maps load only after an explicit map action. The configured tile provider (OpenStreetMap by default) receives the viewed map areas and browser network information. Green markers represent opted-in farmers, grouped when rounded coordinates overlap. Select a marker, choose a farmer, and request a connection. Contacts remain hidden until acceptance. No public farmer samples or exact farm boundaries are invented.
- OpenStreetMap tiles are best-effort, require visible attribution, and must not be bulk downloaded or prefetched. For production traffic, configure an appropriate tile service using `NUXT_PUBLIC_MAP_TILE_URL` (HTTPS template containing `{z}`, `{x}`, `{y}`) and `NUXT_PUBLIC_MAP_ATTRIBUTION`. Public configuration must not contain secret API keys. The list and connection actions remain available if tiles fail.
- Profile hiding removes its shared coordinates, introduction, and contact details. Blocking hides both farmers from each other and prevents connection access. Historical connection records remain stored without revealing a hidden profile's current contact.

## Farm Watch: location and health notifications
- Click **Use my location & get farm advice** to request device permission. Exact device coordinates are rounded to 0.1° before requests. Manual coordinates work if permission is denied. Location is held only in dashboard memory, not published to the farmer map or persisted as a profile location.
- General prompts use your farm type and named enterprises. Heat (daily maximum ≥35°C), rain (daily total ≥20 mm) and cold (minimum ≤2°C) are simple planning thresholds, not crop-specific agronomic limits, diagnoses or official warnings. Check the actual field conditions and local professional guidance.
- Optionally enter a two-letter ISO country code to select EPPO country reporting. This code is not inferred from coordinates. EPPO headlines are labelled country-level, dated by publication month and conservatively limited to a 90-day window. WOAH feed headlines are labelled global animal-health bulletins, never nearby confirmed outbreaks.
- A verified hyperlocal outbreak provider is not configured. Links to official sources remain available. Missing reports, a failed source, or no matching recent headlines do **not** mean the farm or area is disease-free. Historical reports are not relabelled as trending outbreaks.
- Unread/read/dismissed notification IDs are stored in this browser under your account ID (up to 300 per list). They are not encrypted or synced across devices. Coordinates and report content are not saved there. New browser alerts are opt-in for the visit, deduplicated, and begin only after the first successful check. Old/month-only health reports do not trigger browser alerts.
- Monitoring continues across dashboard tools after Farm Watch is first opened and an area selected. Checks are at most every 15 minutes while the page is visible. Closing/reloading the dashboard stops monitoring and clears the area. This is not a service-worker background notification service.

## Offline boundaries
Notes are stored unencrypted in localStorage, partitioned by account ID. Signing out does not erase them. Avoid shared devices for sensitive data. Saved notes survive normal page reloads when storage is available, but this is not a service-worker offline app: reopening the whole site without a connection is not guaranteed. Storage failures retain the open page's in-memory copy and show a warning. Unsaved form text is not guaranteed to survive navigation. Save a note before leaving.

## AI health and identification boundaries
Photos cannot confirm disease. AI responses are presented as guidance rather than diagnoses. The model is instructed not to provide medication/pesticide doses and to direct urgent concerns to qualified professionals. It is instructed not to fabricate confidence percentages. Crop identification is not an edibility assessment. These safeguards do not guarantee model behavior or establish clinical/agronomic accuracy: domain evaluation and professional review are required before broad deployment.

## Storage and deployment
Persistent accounts and tools use Cloudflare D1 through a revision-checked snapshot adapter. Private product photos use R2 and hosting uses Workers. Authentication is app-owned email/password with server-side sessions in D1. Follow `docs/CLOUDFLARE.md` for explicit provisioning, non-overwriting data migration, provider secrets and limits. Local JSON remains a development fallback requiring one Node process and persistent disk. The current D1 snapshot has a 1,000,000-byte global limit, so normalize the data model before significant growth. Production also needs recovery/deletion/export policies, community moderation and background notifications as appropriate.

## Verification
```sh
npm test
npm run build
npm run test:production
```
The API integration suites use isolated temporary data stores. The corruption tests intentionally return 500 and may print expected H3 errors; they verify failure without overwriting data, not corruption of the app's actual store. Weather and AI provider tests use synthetic upstream boundaries. Browser acceptance verified actual management forms, a simulated offline event/reconnect cycle, transcript review/save, a historical keyless weather response (superseded by mocked OpenWeather validation), map consent boundaries, and honest unconfigured AI controls. Paid AI/voice calls and real microphone transcription were not tested without credentials/hardware support.

## Official references checked October 23, 2026
- Cloudflare native AI bindings: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- GPT-OSS 120B native text model: https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
- YarnGPT voice API: https://www.yarngpt.ai/api-docs
- OpenWeather five-day / three-hour forecast: https://openweathermap.org/api/forecast5
- OpenWeather free access pricing (separate from One Call): https://openweathermap.org/price
- OpenWeather attribution: https://openweathermap.org/faq
- OpenStreetMap embed/export: https://wiki.openstreetmap.org/wiki/Export

### Farm Watch sources checked October 24, 2026
- EPPO country reporting: https://gd.eppo.int/country/NG/reporting
- EPPO Reporting Service scope: https://www.eppo.int/RESOURCES/eppo_publications/eppo_reporting_service
- WOAH official news feed: https://www.woah.org/en/feed/
- Official animal disease event portal: https://wahis.woah.org/
- IPPC country reporting bulletin: https://www.ippc.int/en/countries/reportingsystem-summary/all/

Live checks returned both source statuses as available. EPPO's Nigeria index had no headlines inside the conservative recent window, while the WOAH feed returned recent global animal-health headlines. These checks are not evidence of disease presence or absence in Nigeria or near any farm. Source layout changes cause an unavailable status rather than invented reports.
# Phone previews, stock, and AI setup

Run `npm run host` to bind the development server to all network interfaces on port 3000. The command disables fork workers for reliable local startup and uses a strict port, so it exits instead of quietly switching ports when 3000 is already in use. Stop an existing development server first. Connect the phone and computer to the same trusted Wi-Fi and use the Network URL printed by Nuxt, not `localhost` on the phone. On this computer the current LAN address is `http://192.168.0.166:3000`, but DHCP can change it. A local firewall or Wi-Fi client isolation may block access. This is a development preview, not a public production deployment. Do not expose the development server to the internet. Browser microphone and geolocation features may require HTTPS on a phone, so their manual-entry alternatives remain important.

**Inventory versus bookkeeping:** inventory tracks physical quantities and units, while bookkeeping tracks money. Manual inventory edits and public contact-order listings do not post income. The connected Sales & profit workflow now links harvests to stock and confirmed cash sales to stock deductions and bookkeeping. See `docs/CONNECTED_MANAGEMENT.md` for accounting boundaries and setup.

**Farm-specific AI answers:** FarmBuddyAI now offers an explicit **Use my farm records for this conversation** control and a small curated agricultural reference collection. Only a bounded snapshot of the signed-in owner's operational records is eligible. Financial entries, private notes and team/contact details are excluded. This is retrieval-assisted prompting, not automatic training. See `docs/AI_FARM_CONTEXT.md` for consent, sources and provider privacy boundaries.

**Why FarmBuddyAI may be disabled:** chat needs the native Cloudflare `AI` binding, not a chat API key. Open the deployed Worker or use `npm run cf:dev`. Written replies use Workers AI, specialist plant recognition uses `PLANTNET_API_KEY`, experimental cattle screening uses its separate Roboflow configuration, and spoken replies use `YARNGPT_API_KEY`. Configuration checks do not spend inference quota or guarantee model availability. Requests remain bounded and errors do not expose provider credentials. Keep all keys private.

## Product storefronts and teams

- **Marketplace:** choose a unique lowercase farm slug, a public farm name, and whether to publish the storefront. Add products with descriptions, unit prices, quantities, currency, and optional phone/gallery/camera uploads or external HTTPS image URLs. See `docs/PRODUCT_PHOTOS.md` for private R2 storage setup, file limits and local-to-cloud photo cutover. Products and storefronts have separate publication switches. Draft products are never returned by the public API. Changing the farm slug changes its public URL, so previously shared links no longer work.
- **Shareable farm links:** the public route is `/<farm-slug>/products`, for example `/green-acre/products`. Share links use the current site origin, so local links are local and production links use the actual deployed domain. The application does not register, purchase, or configure `farmbuddy.com.ng`; that domain must be connected to a deployment separately.
- **Ordering scope:** buyers can build an in-memory enquiry basket with positive quantities up to the displayed stock, currency-separated estimated totals, and a copyable summary. The basket is cleared on reload and does not send messages automatically. This is a product catalog with contact-based order enquiries, not a payment processor, confirmed-order system, escrow, shipping service, or stock reservation engine. Public ordering contact details require explicit consent and can be removed. Buyer and seller must confirm availability, payment and delivery independently. Do not infer farm identity verification from a storefront listing. External product images are optional and buyer-controlled because loading them shares a network request with the image host.
- **My team:** actual account invitations, owner/manager/worker/viewer permissions and revocation now support the connected workspace. The previous private contact roster remains separately labelled and does not itself grant access. See `docs/CONNECTED_MANAGEMENT.md` for task assignment, offline field capture, production planning, orders and seasonal profit.
- **Seller workspace:** Marketplace opens a visual product board with search and publication filters. **Add product** opens a dedicated photo, details, pricing and stock editor. **Store design** provides a live preview, welcome headline/tagline, phone-uploaded cover, green/teal/sage themes and an optional banner. **Store settings** manages the public name, slug, contact consent and publication. Design changes require an explicit save before going live. Uploaded covers are public only while their storefront is published and its banner is enabled, unless the same photo is independently attached to a published product.
- **Persistence:** production uses Cloudflare D1 for catalog settings/products and team records, with private R2 image storage. Local development can use the atomic local JSON store, which requires persistent disk and a single Node process. Authentication and ownership are enforced server-side, independent of what appears in the sidebar. See `docs/CLOUDFLARE.md` for deployment bindings and current snapshot-store capacity limits.
