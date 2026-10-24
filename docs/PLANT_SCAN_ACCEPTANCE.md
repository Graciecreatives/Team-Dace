# Pl@ntNet live scan acceptance, October 24, 2026

## Reproduction and correction

The live browser scanner returned 502 for both identification and disease checks, despite a valid provider key. The same prepared photo succeeded through Node. Actual workerd reproduction exposed the cause: native Workers fetch rejects `redirect: 'error'` before sending any request.

Both production Pl@ntNet requests, including the disease catalogue lookup, now use `redirect: 'manual'`. Non-2xx responses are still rejected, so redirects never forward photos or keys to another destination. Diagnostic logging includes only processing stage and HTTP status, never provider URLs, keys, photos or response bodies.

## Checks performed

- Root read the worker-authored runtime regression before committing and independently ran it. It executes production validation, multipart transport, catalogue lookup and result normalization in workerd. Only the image codec boundary is stubbed. Fake outbound responses verify identification, disease labels and 302 rejection without following redirects. Existing separate workerd tests cover the actual WASM codec.
- All 297 application regression tests passed, plus the separate native Workers crypto test. Cloudflare production build passed.
- Deployed version `eeccd6fb-2408-4783-80b5-ff7e8e0bb252` after retrying a transient Cloudflare API timeout.
- Real signed-in browser acceptance used the official Pl@ntNet `image_1.jpeg` flower sample, passed through the actual file input and browser photo preparation. Identification completed visibly with Hawaiian hibiscus / Hibiscus rosa-sinensis as the first match (model score approximately 0.60058).
- The same photo's disease check also completed visibly with three low-score suggestions. This verifies actual provider transport and result rendering, not disease correctness. The flower is not a disease validation specimen and those suggestions must not be treated as diagnoses.
- No user records, accounts or stored photos were changed. The scanner does not persist these photos or results. No key is included in this document or tracked source.
