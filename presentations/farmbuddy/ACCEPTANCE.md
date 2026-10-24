# Presentation acceptance

Reviewed October 24, 2026.

## Scope

Twelve 1600 × 900 slides, original SVG artwork, editable HTML/CSS/JavaScript, speaker notes and a locally rendered PDF. This work is separate from the application runtime and requires no new application dependencies.

## Root review

- Inspected all twelve slide compositions as a browser contact sheet and all twelve actual PDF pages as a rendered contact sheet.
- Increased the connected harvest/stock/sale/cashbook illustration after the first review found it too small.
- Checked all slide headings, paragraphs, images and footers against slide bounds. No content crossed the canvas boundary.
- Verified the actual Next button, End key, overview toggle and overview slide selection.
- Phone-sized frame: 383 px layout width, 383 px document width, 363 px fitted slide and visible presentation controls. No horizontal overflow.
- Static validation checks twelve slide sections, local assets, print CSS, JavaScript syntax and absence of remote dependencies or secret-like values.
- PDF export uses the existing local Chromium executable. Physical PDF structure contains twelve pages, each approximately 1200 × 675 points, matching the 16:9 slide canvas.
- Research and product claim boundaries are recorded in RESEARCH.md. No invented market metrics, users, diagnostic accuracy or online payment processing claims were added.

The PDF is a static shareable presentation. The HTML is the editable and keyboard-navigable version. Neither is a PowerPoint file.

## Plain-English revision

- Cover now says “Smart AI farming. Made simple.” and immediately names planning, crop checks, AI questions and sales.
- Crop-check slide explicitly names plant identification and crop disease checks, with possible-match wording rather than a confirmed diagnosis claim.
- Assistant slide says “Your AI farm helper.” and explains questions, photos and voice in simple language.
- Removed jargon such as taxonomy, replay explicitly and connected base from the presentation copy.
- Root visually reviewed the revised cover, crop-check slide and all twelve regenerated PDF pages. Browser geometry checks found no text, image or feature labels crossing the slide footer.
- Final export passed the twelve-page check. Validation now guards explicit AI cover, disease-check and AI helper messaging.

## Screenshot-led landing-page revision

- Cover uses “Smart AI Farming Management System”, includes “Farm shop & e-commerce”, and the brand line reads “Your AI Farm Buddy”. The shop remains buyer enquiries, not online checkout.
- Five real 1600 × 1000 application screenshots were captured from an isolated local demo workspace: overview, production, populated task board, plant scan and assistant. No production records changed. The development toolbar was hidden. See assets/SCREENSHOTS.md.
- Screenshot slides use rounded, softly tinted feature showcases based on the landing page's AppPreviews and FarmToolkit components. Images retain their 8:5 ratio with contain, not distortion.
- Root reviewed the worker diff, checked all twelve slides in Chromium for footer/canvas overlap and broken images, and verified a 390 px viewport has a 390 px document width.
- Root visually reviewed cover, production and plant-check slides, then regenerated and rendered the actual twelve-page PDF and contact sheet.
- Static validation guards the commerce cover entry, Buddy wording and all five screenshot references. No invented AI answer or diagnosis was inserted into a screenshot.
