# Photo and map interaction direction

Reviewed October 24, 2026, against the user's open Animal Detect and Pl@ntNet pages.

## Direction

- Keep FarmBuddy's Plus Jakarta Sans, deep farm green, harvest yellow, soft white and rounded surfaces.
- Plant scanning is a camera workspace, not a form. The photo is the main content. Choose a task with two large visual buttons, choose a plant part with illustrated buttons, then scan.
- Results compare the user's photo with actual provider reference photos. Candidate cards and thumbnails change the comparison without a dialog. Never reuse the user's photo as if it were an independent reference.
- Farm Watch is a map workspace with a compact area/weather rail, inspired by Animal Detect's map-and-details layout. No fabricated cameras, captures, field health or outbreak markers.
- Use location only after a deliberate action. Picking a forecast area on a map is an alternative to typing coordinates. Panning alone never changes the forecast area.
- Show one short disclosure beside the action. Put technical sources, taxonomy and limits in Details, not repeated walls of text or consent gates.
- All core actions have text plus a visual cue, at least 44 px targets, keyboard access, visible focus and reduced-motion alternatives. Do not claim a low-literacy usability study has been performed.

## Animal Detect assessment

The official API quickstart documents `POST https://api.animaldetect.com/v1/detect` with multipart `image`, bearer authentication, an application `User-Agent`, an optional threshold and country code. Results include species labels, scores and normalized `[x, y, width, height]` boxes. This is useful for a future animal-identification or camera-capture review feature.

It is not documented as a veterinary disease diagnosis service. Do not replace plant or cattle health screening with species detection, or label an animal healthy because it was recognized.

Integration requires an Animal Detect account and API key, review of API terms/data handling and coverage for the intended Nigerian livestock/wildlife species. A future implementation should normalize orientation, strip metadata, keep credentials server-side, bound uploads and boxes, display only genuine returned detections, and avoid automatically saving camera locations. Continuous monitoring would additionally require actual cameras/capture ingestion and private records. None of those feeds are invented by this visual redesign.

No Animal Detect key was supplied, no new animal API call was made, and this change does not present Animal Detect as connected. Existing experimental cattle screening remains a separate, explicitly limited provider.

## Primary references

- https://www.animaldetect.com/ (interactive map reference)
- https://www.animaldetect.com/doc/api/quickstart (API contract and prerequisites)
- https://identify.plantnet.org/k-west-tropical-africa/species (image-led reference)
- https://my.plantnet.org/doc/api/identify (same-plant photos and related images)
- https://my.plantnet.org/doc/references/using-images (contributor, platform and license attribution)

Pl@ntNet reference images may be reused only under their individual license requirements. Each displayed reference must credit its contributor, Pl@ntNet and applicable license. Missing or unsupported image attribution means no image is shown, not an invented photo or credit.
