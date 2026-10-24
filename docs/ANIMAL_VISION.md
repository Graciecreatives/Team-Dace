# Experimental animal photo screening

Implementation decision, October 24, 2026.

## Narrow supported task

The animal scanner is an optional **experimental cattle photo-pattern screen**, separate from OpenRouter and Pl@ntNet. It is not a universal animal disease classifier, an animal species identifier, a veterinary diagnosis, or evidence that an animal is healthy.

The fixed research model is Roboflow Universe `cattle-disease-detection/1`. Public project metadata describes a small dataset of 51 images and a CC BY 4.0 dataset licence. This is not independent clinical validation. The application therefore exposes only experimental visual regions, not a pathogen diagnosis, treatment, farm outbreak claim or diagnostic probability. Dataset licensing does not establish model reliability or automatically grant every provider entitlement.

Public model source: https://universe.roboflow.com/raghul-3h7h5/cattle-disease-detection

## Activation and cost control

Disabled by default. The server needs both:

```dotenv
ROBOFLOW_API_KEY=your-private-provider-key
FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN=true
```

Review the model, provider availability, privacy policy and your Roboflow plan before enabling it. Roboflow cloud inference is metered per image and may consume paid credits. No account or subscription was purchased, and no live paid animal inference was performed during implementation.

For Cloudflare, `npm run cf:secrets -- --apply` transfers the explicitly configured settings without printing their values. Setting the experimental flag to `false` and applying settings disables screening. Tests blank provider credentials and use synthetic responses.

Official provider documentation:
- https://docs.roboflow.com/deployment/roboflow-cloud/serverless-api
- https://docs.roboflow.com/deployment/choosing-a-deployment

## Experience and privacy

The farmer chooses or takes a cow photo, previews it, then presses the clearly labelled Roboflow scan button. There is no repeated consent checkbox or automatic upload. One short provider disclosure remains beside the action. Longer source and privacy information is optional.

Browser preparation resizes and re-encodes the image. The server also validates and decodes it, strips metadata, and limits input size and dimensions before contacting a fixed provider endpoint. Location, saved farm records and chat history are not included. FarmBuddy does not save the scan photo or result, and it does not train on uploads. The provider's own processing policies still apply.

Results highlight model-returned areas for its `lumpy` class. These boxes may include the whole animal, not a precisely located lesion, and do not confirm lumpy skin disease. `Healthy` and `objects` predictions are ignored. No returned regions does not mean healthy. The optional Ask FarmBuddyAI action prepares a question for the farmer to review, without automatically sending a question or sharing the scan photo.

## Before any diagnostic deployment

Use a veterinarian-defined task, local representative data, documented ground truth, farm/animal/time-disjoint evaluation, out-of-scope cases, calibration analysis and a prospective expert-reviewed field pilot. Publish per-class errors and version the model. A visible lesion may have many causes, and an RGB photo cannot establish a pathogen. The research methodology in `docs/SPECIALIST_VISION.md` applies here too.

A separate poultry droppings classifier would need its own reviewed model, exact preprocessing, licences and validation. It is not silently substituted for cattle screening and is not implemented as a universal animal diagnosis.
