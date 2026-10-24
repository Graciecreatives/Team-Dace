# FarmBuddy
## Smart AI Farming Management System
### Project description for judges

## Project overview

FarmBuddy is a responsive, full-stack web application that helps crop, livestock and mixed farmers manage their farms as both a production operation and a business. It brings planning, daily tasks, inventory, harvests, sales, bookkeeping, a farmer-owned online shop, weather information and AI-assisted guidance into one connected workspace.

**Our pitch:** FarmBuddy helps farmers plan their work, manage their resources, get practical AI assistance and reach buyers through their own shareable online shop, all in one place.

## The problem we are solving

Running a farm does not end with planting crops or caring for animals. Farmers must also organize workers, remember important dates, track supplies, record harvests, understand money coming in and going out, and find customers.

When those activities are spread across paper notebooks, chat messages, phone photos and separate applications, it becomes difficult to answer everyday questions:

- What needs attention today, and who is responsible?
- How much seed, feed or other stock is left?
- How much did we harvest, sell and spend this season?
- Where can buyers see our current products without asking us to resend every photo and price?
- What might be wrong with this plant, and where can we get guidance?
- How do we record observations when typing is inconvenient or the internet is unreliable?

FarmBuddy is designed around these connected problems. Rather than offering only an AI chatbot or a marketplace, it connects farm activities with the records, people and business decisions behind them. These are the problems the project addresses, not claims from a completed farmer-impact study.

## Our solution and core features

### 1. Farm-specific onboarding and dashboard

Farmers create an account and describe their farm, including its name, type and main crops or animals. The application provides an appropriate crop, livestock or mixed-farm workspace. The dashboard groups work around practical jobs: growing and caring, daily operations, harvesting and selling, and following the money.

### 2. Production planning and farm registers

Farmers can maintain crop and herd registers, create named plots with map boundaries, organize crop seasons or livestock management periods, and add dated schedules and events. These records cover activities such as planting, feeding, breeding, health observations and production.

This gives farmers a structured history of what they planned and what actually happened, instead of leaving important information scattered across informal notes.

### 3. Teamwork and task management

Farm owners can invite team members and assign manager, worker or viewer roles. Tasks can include due dates, a responsible person and a related season. Authorized workers can record completion and permitted stock use.

Permissions are enforced by the server, not just hidden in the interface. A worker does not automatically gain access to private business information or owner settings. This makes collaboration more useful without treating every team member as an administrator.

### 4. Inventory and connected harvest-to-sale workflows

Inventory records track quantities, units, low-stock thresholds and expiry indicators. The important distinction is that stock is connected to actual work:

- A recorded harvest can increase the selected inventory item.
- Completing a permitted task can record supplies consumed.
- A sale draft does not change stock or create income.
- Explicitly confirming a paid cash sale deducts stock and creates the corresponding income entry together.

Repeated confirmation is protected against duplicate stock deductions and income entries. Farmers can also print invoices or receipts and track delivery status. Recording a paid sale documents a transaction that happened outside the platform, it does not collect payment.

### 5. Farm records, bookkeeping and season summaries

FarmBuddy records income, expenses and non-financial activities. Farmers can search and filter entries, review monthly or all-time totals, export filtered records as CSV and use reminders to keep track of upcoming work.

Season-linked costs and sales help farmers review the recorded financial picture of a production period. The application distinguishes recorded cash balance from a complete accounting profit calculation, so it does not present incomplete records as a formal financial statement.

### 6. A farmer-owned online shop with a shareable link

Each farmer can create a public shop with a unique link they can post on WhatsApp, social media or send directly to customers. Farmers can add product photos, descriptions, unit prices, quantities and currency, and customize the shop's headline, cover image and theme.

Instead of repeatedly sending product information to individual buyers, the farmer can share one place where buyers can browse published products. Buyers can build an enquiry basket, see estimated totals and copy an enquiry summary before contacting the farmer to agree on availability, payment and delivery.

The farmer controls when the shop and individual listings are published and whether ordering contact details are exposed. The shop is a product-discovery and enquiry tool, not an online payment or shipping service.

### 7. FarmBuddyAI and reviewed voice input

FarmBuddyAI provides text-based farming assistance. Farmers can optionally allow selected operational farm records to be included in a conversation, helping the assistant respond in the context of their own farm. The application also supplies a small curated agricultural reference collection and shows source references alongside answers.

Voice input makes interaction more practical when typing is inconvenient. After an explicit microphone action, the farmer records audio and receives an editable transcript. They review the words before sending a question or preparing a farm record. Voice-to-record requires confirmation of the category, title, amount where applicable and note before saving. Typed input remains available if recording or transcription fails.

Optional read-aloud uses YarnGPT. AI chat cannot independently modify records, send messages or make payments. AI guidance is assistance, not a replacement for qualified agricultural or veterinary advice.

### 8. Plant identification and possible disease or pest checks

Farmers can select or capture plant photos and request plant identification through Pl@ntNet. Supported responses provide possible species matches and comparison information. A separate limited screening capability can suggest possible disease or pest matches.

The workflow keeps photo selection, scanning and AI follow-up explicit. Possible matches are not confirmed diagnoses, and plant identification is not an assessment of whether a plant is safe to eat.

The repository also includes an experimental, disabled-by-default cattle photo-pattern screening integration. It is a restricted research feature, not a validated animal-diagnosis capability or a universal livestock scanner.

### 9. Farm Watch, weather and area context

Farm Watch brings together five-day forecast information, simple farm-profile-aware planning prompts and sourced plant and animal health bulletins. Farmers can enter approximate coordinates or explicitly permit location access. Maps provide road context and dated broad-area satellite imagery.

Health information is labelled according to its actual source and geographic scope. A global bulletin is not presented as a verified nearby outbreak. Weather prompts support planning, they are not official warnings or crop-specific safety guarantees.

### 10. Farmer connections and limited offline capture

Farmers can choose to appear in approximate-location discovery, request connections and share contact details according to acceptance and visibility rules. Discovery is off by default, and blocking is supported.

For weak-connectivity situations, FarmBuddy supports account-scoped offline notes and selected workspace drafts. Notes can retry upload after reconnecting. Supported operational drafts require review and explicit submission, with server-side checks for permissions, stock and conflicts. This is limited offline capture, not a claim that every application feature works offline.

## Example farmer journey

Consider a mixed farmer preparing a maize season while also keeping poultry. They create a season, record their plot and assign planting work to a team member. Supplies used for the task are recorded against inventory. During fieldwork, they speak an observation into FarmBuddy, review the transcript and save it as an activity record.

At harvest, they record the quantity produced and add it to stock. They publish available maize and eggs in their own online shop and share the shop link with buyers. A customer browses the products and sends an enquiry. Once the farmer receives payment outside the platform, they confirm the sale in FarmBuddy, which updates stock and income together. They can then review the recorded season costs and sales without reconstructing the whole story from separate notebooks and messages.

## Technology stack

| Area | Technology and purpose |
|---|---|
| Full-stack framework | Nuxt 4, with Vue 3 reactive components and file-based application structure |
| Languages | JavaScript ES modules, Vue single-file components, HTML, CSS and SQL |
| Server APIs | Nitro and H3 for request handling, validation and application APIs |
| Interface | Tailwind CSS, custom FarmBuddy components, Reka UI accessibility primitives and Lucide icons |
| Hosting | Cloudflare Workers for the deployed application and static assets |
| Database | Cloudflare D1 for persistent application state with revision-checked writes |
| Image storage | Private Cloudflare R2 objects, accessed through application-controlled authorization |
| AI chat | Cloudflare Workers AI using `@cf/openai/gpt-oss-120b` |
| Speech-to-text | Workers AI using `@cf/openai/whisper-large-v3-turbo`, with browser speech compatibility paths |
| Optional speech output | YarnGPT |
| Plant analysis | Pl@ntNet API |
| Experimental cattle screening | Gated Roboflow integration |
| Weather | OpenWeather five-day forecast API |
| Maps and imagery | Leaflet, OpenStreetMap road tiles and NASA GIBS satellite imagery |
| Health information | EPPO and WOAH source adapters |
| Image processing | Photon WebAssembly for image decoding, resizing, re-encoding and metadata removal |
| Authentication | Application-owned password authentication, scrypt password hashing and server-side sessions |
| Development and testing | Node.js, npm, Wrangler, Node test runner, Vue component checks and production integration tests |

The production application uses Cloudflare D1 and application-owned authentication. Supabase is not the active production database or authentication stack.

## Privacy, safety and responsible design

FarmBuddy separates private management records from public shop content. Publishing products, exposing contact details, sharing location, enabling AI farm context and accessing the microphone require explicit user decisions. Uploaded product and cover images are processed to remove EXIF/GPS metadata. Provider keys remain on the server.

The application validates inputs and enforces ownership and role checks on private APIs. It preserves human review before consequential actions such as saving financial records or confirming sales. External AI and information services are clearly treated as dependencies rather than as guaranteed, always-available capabilities.

## What makes the project distinctive

FarmBuddy's main strength is its connected workflow. Planning, tasks, stock, harvests, confirmed sales and bookkeeping are designed to work together rather than behave as unrelated feature pages. The farmer-owned shop adds a route from managing production to presenting products to buyers, while reviewed voice capture and AI assistance make the same workspace easier to use during everyday farm work.

The project also treats user control as part of the product: farmers decide what becomes public, which farm context reaches AI, who can collaborate and when a draft becomes a saved record.

## Current maturity and next steps

FarmBuddy is a working deployed web application with automated domain, API, component and production-integration checks. The voice-recording repair was tested with controlled audio/provider fixtures and its availability was verified in the deployed Firefox interface, not through a claim of evaluated speech accuracy across languages.

Optional services depend on provider configuration and connectivity. Broader adoption will require representative farmer usability studies, measured field outcomes and further operational hardening. In particular, the current D1 persistence design uses a revision-checked application snapshot with a global size limit. Normalizing high-growth data is an important next step before significant scale.

We do not claim measured yield increases, validated diagnosis, universal language accuracy, payment processing, full offline operation or proven large-scale adoption.

## Intended impact

FarmBuddy aims to reduce the friction of keeping useful records, coordinating work and presenting farm products to buyers. Its intended value is practical: fewer disconnected records, clearer responsibility, more understandable stock and cash movements, and an online shop farmers can share themselves. These outcomes should be evaluated through real farmer use rather than assumed from the feature list.

## Closing statement

**FarmBuddy connects the field, the farm team and the farm business, helping farmers move from scattered information to organized work, reviewed guidance and a shop link they can share with the world.**
