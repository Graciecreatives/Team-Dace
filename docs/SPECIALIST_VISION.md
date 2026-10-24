# Specialist image screening for FarmBuddy

Research and implementation decision, October 24, 2026.

## What is connected

FarmBuddy's **Plant scanner** is separate from Workers AI chat. It calls Pl@ntNet's specialist image-recognition service for either plant species identification or visible plant disease/pest suggestions. The scanner does not ask a language model to invent a disease name, confidence score or treatment.

The integration requires `PLANTNET_API_KEY` in the private `.env` and a server restart. For the deployed Worker, run `npm run cf:secrets -- --apply` after configuring the key. `.env.example` is a template only. The secret helper includes this key without exposing its value. The authenticated Settings service card reports configuration, not successful inference.

No account, subscription or API credits were purchased. Without a key, the UI explicitly says setup is needed. No live provider accuracy is claimed from mocked integration tests. Owner-configured provider quota and terms apply to scans.

## Why this provider

Pl@ntNet documents a specialist deep-learning visual identification engine, expert databases and dedicated species and disease/pest routes. Disease/pest coverage is explicitly limited. Results are preliminary suggestions, not a professional diagnosis. The service does not supply treatment instructions.

Official references:
- https://docs.plantnet.org/en/reference/api-plantnet/
- https://my.plantnet.org/doc/api/identify
- https://my.plantnet.org/doc/api/diseases
- https://docs.plantnet.org/en/understand/diseases-and-pests-identifcation/
- https://my.plantnet.org/doc/getting-started/introduction

The application submits photographs of the **same individual plant**, with up to five photos for species identification or disease/pest screening. Species photos can describe the organ (auto, leaf, flower, fruit or bark). Photos are prepared locally and bounded by a shared upload/pixel budget, then decoded and stripped of metadata again on the server. Provider rejection behavior stays enabled. No-match must never be translated to healthy. Species results can show scientific/common names and genus/family details. Disease results use the provider's public EPPO catalogue for friendly labels when available, retaining the code if the catalogue is unavailable.

A model score is a model ranking/similarity score, **not the probability that a plant has a disease**. FarmBuddy does not create arbitrary score cutoffs, prescribe pesticide doses or diagnose from a photograph. Unclear results require an agronomist or agricultural extension officer. Species suggestions do not establish that a plant is edible.

## Why not download a random leaf model and claim 99% accuracy?

The original PlantVillage research used 54,306 leaf images spanning 38 crop/condition classes and reported a substantial drop on independently sourced images: approximately 31% accuracy for those external image sets. That paper is evidence of domain shift, not the accuracy of today's Pl@ntNet service. Lab-background benchmark accuracy cannot be presented as Nigerian farm accuracy.

Primary source: Mohanty, Hughes and Salathe, *Using Deep Learning for Image-Based Plant Disease Detection*, 2016. https://doi.org/10.3389/fpls.2016.01419

A self-hosted option would need a documented, licensed model artifact, exact preprocessing and label mapping, a model card and independent validation. An unreviewed Hugging Face model or PlantVillage-trained checkpoint is not automatically field-ready. Check dataset and model licensing separately before importing weights or training commercially.

## Livestock: a separate research project, not a universal switch

No universal livestock disease classifier is connected. The optional, disabled-by-default experimental cattle photo-pattern adapter is documented in `docs/ANIMAL_VISION.md`. It displays model-highlighted areas, which may cover the whole animal, not a precisely located lesion or a disease diagnosis. A full-animal photo, a close-up lesion, a droppings image and a video of walking are different tasks requiring different labels and validation.

A defensible first research scope is a **poultry droppings screening study**, not a diagnosis of every farm animal. The original Machuve et al. research distinguishes laboratory-labelled data from a larger field-labelled collection. It explicitly describes label ambiguity, including confusion between healthy and Salmonella-looking samples. Do not treat the entire dataset as PCR-confirmed or its reported accuracy as validation of this app.

Primary sources:
- Machuve et al., *Poultry diseases diagnostics models using deep learning*, 2022. https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2022.733345/full
- Original dataset: https://zenodo.org/records/4628934

For cattle or goats, start with a vet-defined observable task such as lesion detection or locomotion abnormality, not a claim that RGB photos identify pathogens. Symptom histories, examination and laboratory testing can still be necessary. Collapse, breathing difficulty, poisoning, rapid spread or multiple deaths require urgent veterinary help, not more photographs.

## Methodology for an independently validated model

This is a proposed protocol, not a completed experiment:

1. Define supported species, image type, visible conditions and intended use with an agronomist/veterinarian. Include healthy-looking, unknown and out-of-scope cases. Establish laboratory/expert adjudication and resolve ambiguous labels.
2. Obtain explicit data consent and dataset/model licences. Keep images private, strip GPS/EXIF, document retention and permit deletion. Do not automatically train on farmers' chats or scan uploads.
3. Collect representative local images across farms, seasons, lighting, phones and varieties/breeds. Capture context and repeat photographs without leaking them across splits.
4. Split by farm/individual/time before augmentation. Hold out complete farms and a later time period. Deduplicate near-identical images. Random image splits alone can overestimate generalisation.
5. Compare a small transfer-learning baseline such as MobileNet with the proposed detector/classifier. Use a detector/segmenter only when the task needs localising lesions or multiple targets. Publish preprocessing, class definitions, artifact hash and version.
6. Report per-class recall/precision, macro-F1, confusion matrix, sensitivity for important conditions and confidence intervals. Evaluate calibration separately from top-1 accuracy. Set any abstention policy on a validation set, then freeze it for the external test.
7. Explicitly test non-plants, other species, blur, shadows, nutrient/water stress, low-quality photos and unknown diseases. Abstain rather than force every image into a known class. No model score should be advertised as a diagnostic probability without supporting calibration evidence.
8. Run a prospective silent field pilot with expert follow-up before farmer-facing diagnostic claims. Monitor errors and drift, version the release and provide an escalation path. Never infer outbreak prevalence from unconfirmed scans.

Pl@ntNet integration and a future locally validated classifier can coexist. They must identify their source/version and limitations separately. Neither requires a chat model to make the image prediction.

## Interaction design

The scan experience uses task choices, numbered photo previews and an explicit **Scan with Pl@ntNet** action. There is no mandatory consent checkbox or automatic upload. A short provider disclosure stays next to Scan, and long privacy/model/source explanations are under optional Details. It does not open another modal. Chat and scan are separate choices so users can understand whether they are asking for conversational guidance or specialist image screening.

Motion follows the requested `userinterface-wiki` guidance: short action feedback, stable text while reading, no continuous decorative animation, no delayed keyboard navigation, and a static equivalent for reduced-motion preferences. The intention is a simpler flow with recognisable icons and labels. Usability for non-readers or children has not been established without representative participant testing.
