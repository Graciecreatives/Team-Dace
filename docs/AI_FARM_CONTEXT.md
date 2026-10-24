# FarmBuddyAI farm context and knowledge

## What changed

FarmBuddyAI can retrieve a small, server-selected snapshot of the signed-in farmer's own operational records. It also retrieves relevant entries from a small curated agricultural reference collection. This is retrieval-assisted prompting, not training or fine-tuning. The app does not automatically learn from chats, save conversation history to a training dataset, or retrain a model.

The reference collection starts with general crop pest-management principles from FAO and animal biosecurity guidance from Washington State Department of Agriculture. It is not a comprehensive crop/species manual or Nigerian veterinary treatment database. References are paraphrased, identified and linked alongside the answer. A reference being supplied to the model does not prove every statement in its answer is supported. No live disease-outbreak or current-weather verification happens inside chat.

## Farmer control

1. Open **FarmBuddyAI**.
2. Optionally enable **Use my farm records for this conversation**. It starts unchecked.
3. Ask about your saved crops, animals, supplies, reminders or planned work. The snapshot is generated afresh when you press Send, not uploaded automatically when you enable the checkbox.
4. Check the answer's record-use indicator and agricultural reference list. Verify consequential actions with a qualified local professional.

Changing record-sharing consent starts a new conversation so earlier record-grounded answers are not replayed as conversation history after opting out. New conversation and account changes turn sharing off. This does not erase information already sent to an external provider.

## Scope and privacy

- Requests authenticate the current account on the server. Client-supplied farm IDs cannot select another farmer's records.
- This first version uses the account owner's own farm only, not shared team farms. Team members cannot ask the AI to retrieve another owner's private legacy records.
- The snapshot uses bounded, explicit operational fields. It excludes financial entries, private notes, team/contact details, invitations, orders/buyer information, passwords and sessions.
- Free-text record names and observations are still farmer-entered data. They can contain personal information, so do not put secrets or unnecessary personal details into farm records.
- Data and reference snippets are labelled untrusted context, not instructions. The model has no write tools and cannot change inventory, records, tasks, send messages or make payments.
- Conversation state remains in the open page. Text, profile and explicitly selected operational records are sent to Cloudflare Workers AI. The current native text model does not accept photos, which use separate specialist services. External provider retention and training policies apply separately. This implementation does not promise zero retention or that external providers never train on data.
- YarnGPT receives answer text only when the farmer selects Read aloud. An answer may contain farm details, so consider that before using spoken replies.

## Operator setup

Use the native `AI` binding and `FARMBUDDY_AI_MODEL` documented in `.env.example` and `wrangler.jsonc`. No chat API key is needed. Plain Nuxt dev does not expose the binding, so use the deployed Worker or `npm run cf:dev`. No vector database, embedding key or extra paid service is required for the curated retrieval implementation. It does not require or create a fine-tuned model. Keep all provider secrets server-side.

To expand the reference collection, add reviewed, dated, short paraphrases with stable IDs, official source URLs and retrieval tags to `server/utils/assistant-knowledge.js`. Review source relevance and local applicability. Do not insert unreviewed uploaded web text, medication/pesticide dosages, or claims of current outbreaks into the trusted reference collection.

## Verification

Automated tests exercise consent off/on, bounded owner-scoped snapshots, exclusion of sensitive fields, source retrieval, mocked Workers AI binding calls, account changes and late-response cancellation. External AI responses are mocked for validation, so passing tests do not establish diagnosis accuracy or prove a live provider account has credits or model access.
