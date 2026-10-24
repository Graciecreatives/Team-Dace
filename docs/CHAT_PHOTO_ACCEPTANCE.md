# Chat and photo acceptance, October 24, 2026

## Observed on the deployed application

- Native Workers AI answered a real question about watering maize. The reply was concise and included the app's curated agricultural references.
- On an 884 px-high browser viewport, the question input ended at 748.5 px and Send at 792.5 px. Neither required scrolling down to find. A live same-origin 385 × 840 px phone-size frame placed the input bottom at 670.3 px and Send at 770.3 px, with no horizontal overflow.
- A generated English speech fixture, not a farmer's recording, was sent through the deployed Whisper endpoint. HTTP 200 returned `Water the maze tomorrow morning.` The maize/maze homophone demonstrates why transcription remains editable.
- The same generated speech was routed through a browser AudioContext stream into the actual MediaRecorder workflow. The interface showed recording bars and a running `00:05` timer. Stopping produced the editable transcription and `Ready. Check the words, then Send.` No automatic message was sent. The temporary microphone override was restored immediately afterward. This verifies the application recording path, not a physical phone microphone or operating-system permission prompt.
- Live Pl@ntNet inference returned botanical candidates and actual credited reference photos. Hawaiian hibiscus included contributor names and CC BY-SA licensing. These are provider suggestions, not a confirmed diagnosis.

## Automated and packaging checks

Before the subsequent requested model upgrade: 335 regression tests and the additional native-crypto test passed. Node production build, production API workflow tests and Cloudflare Worker build passed. Scanner tests cover related photos, image failures, credits, selection, account resets and the explicit result-to-chat draft handoff. Chat tests cover visible-composer layout, reduced motion, recording limits, permission cancellation, account changes and transcription validation.

## Remaining external constraints

YarnGPT is not configured on the live app. Its transport and failure paths pass mocked and workerd tests, but a live spoken answer cannot be claimed without a YarnGPT key. Browser microphone access on a real phone still depends on HTTPS and the user's permission. Animal detection is not veterinary diagnosis. No fabricated camera feeds or disease markers are displayed.
