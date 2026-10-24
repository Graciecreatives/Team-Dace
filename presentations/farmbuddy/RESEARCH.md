# Research and claim register

Reviewed October 24, 2026. This is a product overview, not an investor forecast or evidence of farmer outcomes.

## Presentation research

- Microsoft Support, **Tips for creating and delivering an effective presentation**. Readable fonts, short copy, purposeful graphics and strong foreground/background contrast inform this deck. https://support.microsoft.com/en-us/powerpoint/tips-for-creating-and-delivering-an-effective-presentation
- FAO, **Guide on digital agricultural extension and advisory services: Use of smartphone applications by smallholder farmers**, April 2023. Background on designing digital advisory services for smallholder use. https://www.fao.org/science-technology-and-innovation/resources/publications/guide-on-digital-agricultural-extension-and-advisory-services-use-of-smartphone-applications-by-smallholder-farmers/en
- SEARCA, **From Digital Advice to Farm Action**, September 29, 2026. Its distinction between service availability and farmers' ability to access, use and apply advice informs our action-led narrative. This is regional context, not evidence that FarmBuddy improves yields. https://knowledgeplatform.searca.org/knowledge-watch/from-digital-advice-to-farm-action-what-makes-extension-work-for-southeast-asian-smallholders/

## Product evidence

| Slide | Repository evidence | Claim boundary |
| --- | --- | --- |
| 1–3 | app/components/FarmDashboard.vue, docs/DASHBOARD_AUDIT.md | Product organization, not adoption or outcome statistics. |
| 4 | app/components/FarmProduction.vue, server/utils/farm-production.js | Seasons, mapped plots and animal activity histories. Not autonomous agronomy. |
| 5 | app/components/FarmOperations.vue, app/components/FarmTeam.vue | Team/task permissions and inventory-linked usage. Names may vary in illustrative UI. |
| 6 | server/utils/farm-business.js, tests/direct-sale.test.js | Recorded paid sales atomically update stock and cashbook. Does not collect payment. |
| 7 | app/components/FarmMarketplace.vue, app/pages/[farmSlug]/products.vue | Published products, customizable storefront and enquiry basket. Not online checkout. |
| 8 | app/components/FarmWatch.vue, app/components/FarmSatelliteMap.vue | Area selection, road/satellite imagery and available forecast. Not live cameras, crop diagnosis, or measured soil moisture. |
| 9 | app/components/FarmScan.vue, server/utils/plant-vision.js | Pl@ntNet photo suggestions, supplied reference images/credits and taxonomy. Not a confirmed disease diagnosis. |
| 10 | app/components/FarmAssistant.vue, server/utils/assistant.js, server/utils/assistant-transcribe.js | Cloudflare-bound chat, supported photos and dictation. Farm records are permission checked. No automatic learning from chats. YarnGPT is not claimed as live configured. |
| 11 | app/composables/useFarmWorkspace.js, server/utils/database.js, server/utils/product-images.js | Explicit scoped offline replay, D1 and private R2 storage. Not every feature works offline. |
| 12 | Same product sources | Invitation to use existing workflows, not an implementation promise. |

## Visual provenance

All diagrams and interface compositions are original explanatory illustrations, not proof of field measurements. No farmer private data, API keys, live account details or borrowed plant photographs are included. Reference-image attribution remains a runtime responsibility in the application.
