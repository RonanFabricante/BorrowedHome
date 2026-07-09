# BorrowedHome design tokens

Source of truth: `app/globals.css` (`:root`).

## Color (6 roles)

| Token | Role | Approx |
|-------|------|--------|
| `--color-primary` | Eucalyptus green — brand, day arc, links | `#1F3D2B` |
| `--color-accent` | Clay/ochre — primary CTAs only | `#A85A30` |
| `--color-bg` | Warm off-white page ground | `#F6F3ED` |
| `--color-ink` | Warm near-black text | `#221E1A` |
| `--color-error` | Destructive / errors | `#AE2E2E` |
| `--color-success` | Success states | `#2C6B4A` |

`--warning` aliases `--color-accent` for soft alerts (not a 7th hue).

## Type

- **Display:** Fraunces (serif) — `h1` / `h2` / hero only
- **Body/UI:** Source Sans 3
- Scale: 1.25 major third (`--text-xs` … `--text-4xl`, `--text-hero` via `clamp`)

## Elevation & radius

- `--shadow-card`, `--shadow-elevated`
- `--radius-sm` / `--radius` / `--radius-lg`

## Signature

`DayArc` — max 3 placements: homepage hero, booking confirm, footer.
