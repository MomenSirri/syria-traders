# Syria Traders design system: "Felt & Brass"

Source of truth for the UI. Built with the rules of
[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (its
"Card & Board Game" palette: felt green and gold on dark). Tokens live in
`client/src/styles/index.css`; components never use raw colours for chrome.

## Direction
- Night-ink chrome, a felt-green table under the board, brass gold for emphasis.
  The colourful board is the hero; panels around it stay calm and dark.
- One gold primary action per screen (Roll dice, Begin, Start the match).
  Confirmations (Trade, Accept, Offer) are green pills. Everything else is quiet.
- Player colour identifies seats: top inlay, avatar ring, score ring, turn pill.

## Tokens
| Role | Token | Value |
| --- | --- | --- |
| Background | `--bg` / `--bg-2` | `#0a0f17` / `#0e1520` |
| Surfaces | `--surface-1..3` | `#121a26` `#172131` `#1e2a3d` |
| Text | `--text` / `--text-2` / `--text-muted` | `#f3efe6` / `#cdd4de` / `#97a3b4` (all ≥ 4.5:1) |
| Primary | `--gold` (+ `--on-gold`) | `#e2b450` on `#1c1406` |
| Felt | `--felt` / `--felt-deep` | `#1b4a3a` / `#0d2a22` |
| Confirm | `--green` | `#1f8a4c` (white text) |
| Danger | `--danger` | `#e2553f` |

Resources: `--res-wheat|wood|stone|brick|sheep`, shown as tinted chips
(`ResourceChip`) so dark-stroked icons read on dark surfaces.

## Type
Marcellus (display, headings) + Manrope (UI), both bundled offline.
Scale 11 (caps labels only) / 12 / 13 / 14 / 16 / 20 / 24 / 32 / 44.
Tabular figures for every count, score, die total and room code.

## Space, shape, depth
4/8 rhythm (`--sp-1..12`). Radius 6/8/12/16/22. Elevation `--shadow-1..4`.
Layers `--z-raised 10`, `--z-overlay 40`, `--z-banner 50`, `--z-modal 100`, `--z-fx 200`.

## Motion
`--dur-press 110ms`, `--dur-fast 160ms`, `--dur 240ms`, `--dur-slow 380ms`.
Enter with `--ease` (decelerate), pops with `--ease-spring`, presses scale to 0.97.
Only transform/opacity animate. `prefers-reduced-motion` turns movement off.

## Rules we keep
- Icons: one stroke family (`components/Icon.jsx`), never emoji, `aria-hidden` beside text.
- Focus: 2px gold outline on every control. Escape closes the help dialog.
- Touch: 44px targets on phones; the phone hand is sticky at the top.
- The TV never shows hand contents; the QR code stays black on white.
