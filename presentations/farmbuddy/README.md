# FarmBuddy product presentation

A 12-slide product overview in FarmBuddy's forest-green, yellow and cream design. Intended for a short product introduction or demonstration, not a financial investment prospectus.

## Present

Open `index.html` in a modern browser. Use the on-screen arrows or keyboard arrow keys. The HTML, CSS and SVG files are editable and work without an external network connection. Keep this folder together when sharing the editable version.

The portable PDF is `FarmBuddy-Product-Overview.pdf`.

## Regenerate and validate

From the repository root:

```sh
node presentations/farmbuddy/validate.mjs
node presentations/farmbuddy/export.mjs
```

Export uses an installed local Chromium browser, not a remote rendering service. See the export script for executable discovery and overrides.

## Content and design

- `DESIGN.md`: visual direction.
- `RESEARCH.md`: sources, slide-by-slide claim boundaries and visual provenance.
- `index.html`: slide content and presenter notes.
- `deck.css` and `deck.js`: presentation layout and navigation.
- `assets/`: original explanatory illustrations.

Illustrative boards, maps and product cards explain the workflows. They are not fabricated evidence of actual farm readings, customers or commercial outcomes. The presentation does not claim online payment collection, autonomous diagnosis, live camera monitoring or complete offline functionality.
