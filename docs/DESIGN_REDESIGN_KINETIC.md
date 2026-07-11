# Kinetic editorial redesign — deliverable notes

## Accent

**Electric chartreuse `#C6F84C`** — daylight energy for day-use (sun through leaves), not racing lime. Text uses `--color-accent-ink` for AA.

## Tokens

See `docs/DESIGN_TOKENS.md` and `app/globals.css`.

## Screenshots

Agent environment has no Node/npm PATH for Playwright captures. Please verify locally at 1440px and 375px:

1. `/` — hero + search above fold, stat band, featured, how-it-works, suburb table  
2. `/listings` — mono counts, hover image swap on cards  

## Mechanics NOT translated (and why)

| Source technique | Why skipped |
|------------------|-------------|
| Dark theme / lime-on-black | Trust marketplace needs light warm base |
| Scroll-jacking / horizontal track | Blocks search/booking; hard limit |
| WebGL / 3D helmets | Perf + irrelevant to homes |
| Full-bleed racing photography identity | Wrong category; we use home daylight plates |
| Persistent loading brand gag as primary UX | Witty empty states only; search stays clear |
| Parallax layers | Motion budget + a11y |

## Signature placements (3)

1. Homepage hero — `DayArc` + live availability  
2. Booking confirmed — `DayArc`  
3. Footer — `DayArc`
