# Native Workers AI acceptance

Verified October 24, 2026.

- Runtime: private Cloudflare `AI` binding, model `@cf/qwen/qwen3-30b-a3b-fp8`. No chat API key, HTTP gateway or fallback provider.
- Removed the previous gateway references from tracked sources, tests, docs, environment template, private local configuration and compiled deployment bundle. Remote secret-name listing contained only the specialist plant key. Private `.env` and `.dev.vars` remain ignored.
- Root reviewed implementation worker diffs before commit `6c7bfef`. Preserved authentication, CSRF, rate limits, owner-scoped optional farm context and curated references. Native inference waiting is bounded at 45 seconds and output at 1,000 tokens / 6,000 displayed characters. Waiting timeout does not guarantee cancellation of inference.
- All 296 regression tests passed, plus the separate native Workers crypto test. Node production build/restart tests and Cloudflare production build passed. Tests inject native bindings and never make paid inference calls.
- Deployed Worker version `8356a807-ac7c-49db-836e-c167e288f1eb`. Wrangler reported the AI, D1, R2 and static asset bindings.
- Live browser acceptance: signed-in demo account, FarmBuddyAI sidebar interface, typed and sent one short maize-watering question. A nonempty agricultural response appeared with the native Qwen model label, no reasoning tags and no shared farm-record snapshot. This was one real, bounded inference request, not a mocked response.
- User-supplied specialist plant key was stored privately using Wrangler. Authenticated live scanner configuration returned 200 / configured true after upload. The key is not committed or recorded here. Rotation was recommended because it was pasted into chat.

## Boundaries

The native model is text-only. Plant recognition and supported disease screening still use the separate specialist scanner. No live plant-image inference or veterinary accuracy evaluation was performed in this acceptance. YarnGPT and the experimental cattle provider still need their separate configuration. Use `npm run cf:dev` for local native AI (remote inference consumes account quota). Plain Nuxt `dev` and `host` do not supply the binding and report chat unavailable.
