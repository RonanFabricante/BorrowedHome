# BorrowedHome design tokens

Source of truth: `app/globals.css` (`:root`).

## Accent choice

**Electric chartreuse** `~#C6F84C` (`--color-accent`) — daylight energy for a day-use marketplace (late-morning sun through leaves), not racing lime. Large numerals and CTA fills use the electric value; **`--color-accent-ink`** (~olive chartreuse) is used for text-sized accents to meet WCAG AA on warm white.

## Color (6 roles + accent-ink companion)

| Token | Role | Approx |
|-------|------|--------|
| `--color-primary` | Eucalyptus — brand, nav emphasis | `#1F3D2B` |
| `--color-accent` | Electric chartreuse — CTA fills, day arc, large marks | `#C6F84C` |
| `--color-accent-ink` | Darkened accent for AA text / underlines | `#4A6B12` |
| `--color-bg` | Warm off-white page ground | `#F6F3ED` |
| `--color-ink` | Warm near-black text | `#221E1A` |
| `--color-error` | Destructive | `#AE2E2E` |
| `--color-success` | Success | `#2C6B4A` |

CTA = accent fill + ink foreground (not white-on-chartreuse).

## Type (3 faces)

- **Display:** Space Grotesk — oversized lowercase headlines (`--font-display`)
- **Data:** IBM Plex Mono — stats, times, prices, captions (`--font-mono`, `.bh-data` / `.bh-micro`)
- **Body:** Source Sans 3 — reading UI (`--font-body`)

Hero scale: `--text-hero` via `clamp()`.

## Motion

- Hero headline settle ≤600ms
- Count-up on scroll ≤800ms (once)
- Scroll reveal fade+rise
- Home card image hover swap
- `prefers-reduced-motion` disables all
- Search card inputs: no entrance animation

## Signature

`DayArc` — sunrise → 9:00 PM with live “now” marker. Max 3 placements: homepage hero, booking confirm, footer.
