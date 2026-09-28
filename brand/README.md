# HazeNow brand — mark C "Sun over haze"

A dot (the reading) above three fading haze lines. On live surfaces the dot takes the NEA band colour; the lines never change. Store/app icons keep the ivory dot so the brand is never alarming.

Palette: Ink `#14232B` · Ivory `#F5F0E6` · Mist `#9FB3BB` · Paper `#F3F1EC`. Type: Instrument Serif (display) / Instrument Sans (UI).
Band dot colours: Normal `#2E9E5B` · Elevated `#E8A317` · High `#E4572E` · Very High `#7B2D8E` (on dark backgrounds use `#B06BC4`).

| file | use |
|------|-----|
| `svg/mark-*.svg` (viewBox 100) | full mark: ink, on-dark, `currentColor` |
| `svg/mark-small-template.svg` | ≤32 px variant (dot + 2 lines), black template (macOS menu bar / Android status icon) |
| `svg/app-icon.svg` → `png/app-icon-*.png` | full-bleed 1024 (iOS, web, stores; platform applies the mask) |
| `svg/app-icon-maskable.svg` → `png/app-icon-maskable-*.png` | PWA maskable (80% safe zone) |
| `svg/app-icon-macos.svg` → `png/macos-*.png` | macOS icon grid (824 on 1024, shadow) |
| `svg/favicon.svg` → `png/favicon-*.png` | favicon |
| `png/menubar-template-18/36.png` | menu bar template image @1x/@2x |

Regenerate PNGs: render the SVGs with `@resvg/resvg-js` (see git history of this README for the script) — sizes listed above.
Exploration canvas: https://claude.ai/artifact/NvTj7gV9sGSu1hnqpHSpnt (private).
