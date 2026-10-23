# FarmBuddy product roadmap

## Product goal
A voice-first farming companion for crop, livestock, and mixed farmers. Farmers should be able to keep records, ask questions, share photos for guidance, and find nearby farmers without needing technical knowledge.

## Farmer journeys
- Crop farmer: onboarding → `/dashboard/crops`.
- Animal farmer, including poultry: onboarding → `/dashboard/livestock`.
- Mixed farmer: onboarding → `/dashboard`.
- Onboarding: farming type, farm name, main crops or animals, optional location, and preferred language.
- Returning farmers should land in their own workspace, not repeat onboarding.

## Current scope and next integrations
Working foundation: local accounts, onboarding, tailored dashboards, income/expense/activity records, and in-app reminders.
Planned integrations: real AI conversation, YarnGPT voice, plant/animal image guidance, crop identification, and opt-in nearby-farmer maps. Preview cards must not imply those services are already connected. In-app reminder dates are not yet background notifications.

## Recommended additional features

### Priority 1: Everyday value
1. **Farm-aware AI memory:** remember crops, animal species, growth stage, farm location, and previous issues, with farmer correction and deletion controls.
2. **Voice-to-record confirmation:** turn “I sold twenty eggs for…” into a draft income record. Read it back and require confirmation before saving.
3. **Crop and herd registers:** separate fields and planting dates for crops; individual animals or flock/batch groups for livestock, including births and purchases.
4. **Seasonal care plans:** editable planting, watering, feeding, vaccination, and harvest schedules. Clearly distinguish calendar suggestions from professional advice.
5. **Offline drafts:** save notes, photos, and questions when connectivity is poor. Show sync status and avoid duplicate records when reconnecting.
6. **Expense and profit breakdowns:** compare by field, crop cycle, flock, or animal batch, rather than just overall farm totals. Allow CSV export.

### Priority 2: Decisions and connection
7. **Local weather and task planning:** forecast summaries and optional rain/heat alerts tied to farm tasks. Show forecast source, timestamp, and uncertainty.
8. **Veterinarian/agronomist handoff:** share a farmer-approved case summary with a professional when an issue is urgent or the AI is uncertain.
9. **Input inventory:** track seed, feed, fertilizer, and supplies with low-stock and expiry reminders. Do not generate unverified treatment doses.
10. **Consent-based farmer network:** discover by approximate area and farming interest, request contact, block/report users, and hide your profile anytime.
11. **Market price diary and buyer matching:** distinguish farmer-entered prices from verified market feeds and show market/date/unit for comparisons.
12. **Learning library:** short, reviewed lessons with audio, illustrated checklists, and saved material for low-connectivity access.

### Priority 3: Trust and scale
13. **Cooperative/team accounts:** role-based access for farm workers, shared tasks, and an audit trail for changed records.
14. **Farm passport export:** a farmer-controlled summary of activity and production. Never label self-entered records as independently verified.
15. **Regional outbreak notices:** sourced, time-stamped alerts from trusted authorities, with privacy protection and a way to correct false reports.
16. **Sensor integrations:** optional soil moisture, water-level, and temperature readings with device-health and stale-data warnings.

## AI and voice design
- Pipeline proposal: recorded speech → transcription → farm-context retrieval + a reasoning/vision model → reviewed answer text → YarnGPT speech output.
- YarnGPT is the voice layer, not proof of agronomic or veterinary expertise. Validate transcription languages and voices against the provider's current API catalogue before promising support.
- Keep provider keys on the server. Add request limits, upload limits, audio retention controls, cancellation, and cost tracking before enabling paid calls.
- Photo workflow: farmer selects crop/animal → consents to upload → photo-quality check → symptom/context questions → possible explanations and safe next steps. Crop identification is a separate task from disease guidance.
- Do not present a photo result as a confirmed diagnosis. Offer uncertainty, alternative explanations, and expert escalation. Only display numerical confidence if it has actually been calibrated and evaluated for the relevant use case.
- Ask before saving AI-derived records, publishing location, contacting other farmers, or sharing health photos.

## Map privacy
- Request location only after an explicit farmer action and explain why it is needed.
- Default to approximate area, not an exact home/farm pin. Permit manual location entry and opt out.
- Never populate a live-looking map with fabricated farmers. Label sample data if used in a design preview.

## Delivery order
1. Foundation: onboarding, specialized dashboards, records, and reminders.
2. AI text chat with farm context and reviewed agricultural references.
3. YarnGPT voice with confirmed language coverage, transcript correction, and explicit microphone consent.
4. Vision guidance and crop identification with evaluation and expert escalation.
5. Opt-in farmer discovery and real map integration.
6. Offline sync, weather, professional referrals, and cooperative tools.

## Reference checked October 23, 2026
YarnGPT official API documentation: https://www.yarngpt.ai/api-docs
This roadmap proposes features. It does not claim they are already integrated or promise model accuracy.
