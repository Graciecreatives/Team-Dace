# Clean chat and direct sale acceptance

Verified October 24, 2026 against an isolated local account, not a real farmer's financial data.

## Chat

- Desktop viewport 1996 × 1114: composer bottom 1106 px, about 8 px above the viewport edge. Document height stayed within the viewport.
- Phone-sized same-origin frame 385 × 840: composer bottom 832 px. No horizontal overflow.
- Injecting a long conversation made only the history scroll. It did not move the composer or add page scrolling.
- Opening About did not move the input. Connected-state configuration labels and tool descriptions are removed. Actual errors remain visible.

## Paid sales

- Used actual rendered controls: Record sale → Maize → sale details → quantity 2 and unit price NGN 100 → Record paid sale.
- Review showed NGN 200 and stock 24 → 22 kg before submission.
- Successful receipt closed the editor, created a confirmed immutable invoice, increased recorded income to NGN 200, and showed 22 kg on the next product picker.
- At 385 px wide, action tiles measured approximately 343 px and the page had no horizontal overflow.
- Component command IDs are preserved by the workspace composable so a receipt can clear only its matching submitted draft.
- Domain and actual HTTP tests cover permissions, replay, history bounds, no partial mutations, safe minor-unit rounding, concurrent overselling rejection, and unchanged legacy unpaid orders.

Paid sales record payment already received. They do not charge a card or collect money. Deployment acceptance is recorded separately after publishing.
