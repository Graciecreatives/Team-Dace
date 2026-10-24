# FarmBuddy slide illustrations

Four original, editable SVG illustrations created specifically for the FarmBuddy product overview. No external artwork, raster images, dependencies, scripts or network resources.

| File | Intended use | Content |
| --- | --- | --- |
| `farm-landscape.svg` | Cover or product vision | Sweeping crop rows, barn, trees and sun |
| `connected-flow.svg` | Business workflow | Harvest → Stock → Sale → Cashbook |
| `field-map.svg` | Field planning / Farm Watch | Schematic parcels and a location pin |
| `plant-scan.svg` | Plant reference workflow | Leaf capture and illustrated reference-photo cards |

## Design and integration

- All canvases: `width="1600" height="900" viewBox="0 0 1600 900"`, transparent outside the artwork, with generous outer margins.
- Use as an image at its native 16:9 ratio with `object-fit: contain`. Best on white or warm cream. Do not crop the labels.
- Palette: forest `#005f36`, yellow `#ffcf38`, warm cream `#fff9e8`, sage and pale green support colors.
- Brand grounding: inspected `app/assets/css/main.css` and `app/assets/css/components.css` before drawing. The app uses forest `#066136`, yellow accents, cream/green surfaces, rounded buttons and panels. These illustrations use the requested closely related presentation palette.
- Only native SVG geometry and system-font labels. Accessible titles/descriptions are embedded. Inline embedding multiple copies requires prefixing SVG IDs and their references to avoid collisions. External `<img>` embedding does not share IDs.
- Field map is prominently labeled **Illustrative map**. It is not satellite/camera imagery, measured boundaries or live field data.
- Plant artwork is prominently labeled **Illustrative workflow**. The reference-photo cards are drawings, not photographs. No disease diagnosis, confidence percentage or accuracy claim is implied.

## Validation

All four files passed Python standard-library XML parsing and assertions for SVG namespace, exact 1600 × 900 dimensions/viewBox, accessible title/description, resolvable local fragment references, no external hrefs, no scripts/images/foreign objects, and no opaque full-canvas rectangle. Validation performed October 24, 2026. No dependencies were installed. Deck-level visual review remains with the root/deck builder.
