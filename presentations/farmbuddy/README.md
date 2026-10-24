# FarmBuddy product presentation

A 12-slide product overview: **Smart AI Farming Management System.** Uses plain English, large application screenshots and FarmBuddy's forest-green, yellow and cream design. Covers farm planning, tasks, inventory, sales, the farm shop, plant identification, possible crop disease checks and **Your AI Farm Buddy**. Intended for a short product introduction or demonstration, not a financial investment prospectus.

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
- `assets/`: original explanatory illustrations and real application screenshots from an isolated demo workspace. See `assets/SCREENSHOTS.md` for capture provenance.

Real application views show the dashboard, production, task board, plant scan and assistant interfaces. Illustrative maps and shop cards remain clearly distinguished from actual screenshots. Sample records are not evidence of customer outcomes. Farm shop/e-commerce means product listings and buyer enquiries, not online checkout. The presentation does not claim online payment collection, autonomous diagnosis, live camera monitoring or complete offline functionality.
