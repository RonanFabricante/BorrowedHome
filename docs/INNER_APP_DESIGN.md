# Inner app design extension

## Authenticated route inventory

| Route | Role |
|-------|------|
| `/my-bookings` | Guest bookings |
| `/my-listings` | Host listings + booking requests |
| `/host/dashboard` | Host KPIs / tabs |
| `/host/payouts` | Stripe Connect |
| `/host/onboard` | Create listing |
| `/host/stripe/onboarding` | Stripe redirect |
| `/notifications` | Inbox |
| `/bookings/[id]/confirm` | Booking detail |
| `/bookings/[id]/messages` | Messages |
| `/bookings/[id]/review` | Review |
| `/listings/[id]/edit` | Edit listing |

Auth: `/auth/login`, `/auth/signup`, `/auth/reset-password`, `/auth/update-password`

## Status → label map (`lib/ui/tokens.ts` + `StatusChip`)

| Status | Label | Tone |
|--------|-------|------|
| `REQUESTED` / `PENDING` | Requested | info |
| `PAYMENT_PENDING` | Awaiting payment | warning (accent tint) |
| `CONFIRMED` | Confirmed | accent |
| `COMPLETED` | Completed | muted |
| `CANCELLED` | Cancelled | muted |
| `DECLINED` / `REJECTED` | Declined | destructive |
| `EXPIRED` | Expired | muted |
| listing published/draft | Published / Draft | accent / muted |
| ledger credit/payout/… | Credit / Payout / … | mapped |

## Still off-system (follow-ups)

- `/host/payouts` and `/host/onboard` still use older card chrome (functional, not fully kinetic).
- Booking confirm page is human-labeled but not yet on `BookingCard` anatomy.
- Auth forms are intentionally quieter than marketplace pages.

## Screenshots

Capture locally at 1440 / 375: `/my-bookings`, `/my-listings` (agent shell has no Node for Playwright).
