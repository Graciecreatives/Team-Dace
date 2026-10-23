# FarmBuddy features and setup

## Available dashboard tools
- Crop/herd registers with quantity, unit, start date, notes, editing, and confirmed deletion.
- Inventory with editable quantities, low-stock thresholds, expiry indicators, and confirmed deletion.
- Offline notes saved in account-scoped browser storage before upload. Reconnecting retries the queue with idempotent UUIDs. Notes are immutable after saving to avoid silent offline edits overwriting newer content. Copy to a new draft to revise.
- Voice-to-record using browser dictation when supported, with an always-available typed/pasted transcript fallback. The farmer reviews the category, title, amount, and note before saving. No money is inferred from speech.
- Expert referrals as private case summaries with farmer-entered contact details, status tracking, and copy/download. No verified professional directory, appointment booking, or automated sending is included.
- Real Open-Meteo five-day weather with in-app heat/rain planning indicators, source attribution, and checked time. These are not official emergency warnings, push notifications, or background monitoring.
- Real farmer discovery from opted-in FarmBuddy accounts, approximate area maps, connection requests, explicit acceptance before sharing contact details, and blocking. There are no fabricated farmers and no in-app farmer chat.
- Configurable AI chat, photo-based plant/animal guidance, crop identification, and YarnGPT spoken answers. The UI reports whether providers are configured.

## Run locally
```sh
npm install
npm run dev
```
Visit localhost port 3000. Register, complete onboarding, and open a tool from the dashboard sidebar. Existing users without onboarding are asked to complete it. Crops route to `/dashboard/crops`, livestock/poultry to `/dashboard/livestock`, and mixed farms to `/dashboard`.

## Enable AI and voice
1. Copy `.env.example` to `.env` locally and fill in `OPENAI_API_KEY` and/or `YARNGPT_API_KEY` yourself. Do not paste keys into chat or client-side code.
2. Optionally select `FARMBUDDY_AI_MODEL` and a current `YARNGPT_VOICE` ID from the provider catalogue. The default AI model is `gpt-4.1-mini`; it must be enabled for your provider account.
3. Restart the dev server after changing environment variables. Production requires environment variables supplied to the running Node server, not just a local `.env` file.
4. Open AI assistant & photos. Questions share selected farm profile fields and conversation context with OpenAI. Photos require explicit consent and are sent only with Send. We request `store: false`, but provider retention policies still apply.
5. Read aloud shares the answer text with YarnGPT and returns audio. Browser dictation is a separate browser service, not YarnGPT transcription. Language support varies by browser/service. No microphone is opened automatically, and speech is never sent as a question without review.

Provider requests may incur charges. The app does not sign up, top up, purchase credits, or test live paid AI calls automatically. API keys remain server-side. Rate limits and bounded uploads are implemented, but production still needs account-level budgets, monitoring, and abuse controls.

## Weather and maps
- Weather checks use entered or explicitly requested device coordinates, rounded to 0.1° before requesting the forecast. They do not automatically publish a farmer profile.
- Open-Meteo's free endpoint is for non-commercial development. Commercial deployments should obtain the appropriate plan and set `OPEN_METEO_API_KEY`, which selects the customer endpoint.
- Planning indicators use daily maximum temperature at least 35°C or precipitation at least 20 mm. They are illustrative planning thresholds, not crop-specific safety limits or a guarantee that other hazards are absent.
- Weather is cached server-side for 15 minutes by rounded area. No forecast is fabricated on provider failure.
- Farmer discovery is hidden by default. Publishing requires a public farm name, rounded coordinates, and explicit consent. Location permission is optional, with manual coordinate entry available.
- Map iframes load only after an explicit map action. OpenStreetMap then receives the selected rounded area and browser network information. Maps show one selected area at a time, not exact multi-farm boundaries.
- Profile hiding removes its shared coordinates, introduction, and contact details. Blocking hides both farmers from each other and prevents connection access. Historical connection records remain stored without revealing a hidden profile's current contact.

## Offline boundaries
Notes are stored unencrypted in localStorage, partitioned by account ID. Signing out does not erase them. Avoid shared devices for sensitive data. Saved notes survive normal page reloads when storage is available, but this is not a service-worker offline app: reopening the whole site without a connection is not guaranteed. Storage failures retain the open page's in-memory copy and show a warning. Unsaved form text is not guaranteed to survive navigation. Save a note before leaving.

## AI health and identification boundaries
Photos cannot confirm disease. AI responses are presented as guidance rather than diagnoses. The model is instructed not to provide medication/pesticide doses and to direct urgent concerns to qualified professionals. It is instructed not to fabricate confidence percentages. Crop identification is not an edibility assessment. These safeguards do not guarantee model behavior or establish clinical/agronomic accuracy: domain evaluation and professional review are required before broad deployment.

## Storage and deployment
Persistent accounts and tool data currently use a permission-restricted JSON file. See `server/README.md`. Use one Node process and persistent disk, back up the file, and do not deploy this store to ephemeral/serverless or multi-instance hosts. A production rollout should migrate to a transactional database, add recovery/deletion/export policies, professional verification, community moderation/reporting, and background notification delivery if required.

## Verification
```sh
npm test
npm run build
npm run test:production
```
The API integration suites use isolated temporary data stores. The corruption tests intentionally return 500 and may print expected H3 errors; they verify failure without overwriting data, not corruption of the app's actual store. Weather and AI provider tests use synthetic upstream boundaries. Browser acceptance verified actual management forms, a simulated offline event/reconnect cycle, transcript review/save, a live keyless weather response, map consent boundaries, and honest unconfigured AI controls. Paid AI/voice calls and real microphone transcription were not tested without credentials/hardware support.

## Official references checked October 23, 2026
- OpenAI Responses API and image inputs: https://platform.openai.com/docs/api-reference/responses
- YarnGPT voice API: https://www.yarngpt.ai/api-docs
- Open-Meteo forecast: https://open-meteo.com/en/docs
- Open-Meteo terms: https://open-meteo.com/en/terms
- OpenStreetMap embed/export: https://wiki.openstreetmap.org/wiki/Export
