# Superadmin console

Internal ops UI at `/admin` for platform operators.

## Setup

1. Apply migration `032_superadmin_and_audit.sql` in Supabase SQL Editor.
2. Grant yourself access (replace with your auth user UUID):

```sql
UPDATE public.profiles
SET is_superadmin = true
WHERE id = 'YOUR_USER_UUID';
```

3. Sign in on borrowedhome.app — **Admin** appears in the nav. Open `/admin`.

## Capabilities

| Area | Actions |
|------|---------|
| Overview | KPIs: stuck payments, disputes, listings, incomplete Connect |
| Bookings | Filter; force status (COMPLETED / CANCELLED / EXPIRED / CONFIRMED / DECLINED) with reason |
| Payments | Sync from Stripe; capture + transfer; release deposit; clear dispute hold |
| Listings | Publish / unpublish |
| Hosts | Connect onboarding / charges / payouts status |
| Audit | `admin_actions` log |

All mutations go through `/api/admin/*` (session + `is_superadmin` check) and use the service-role client. Every write is audited.

## Notes

- Capture + transfer is safe if the PaymentIntent is already `succeeded` (skips capture, retries transfer with idempotency key `booking-payout-{bookingId}`).
- Transfer can still fail if the platform Stripe balance is too low (common on tiny test charges after fees).
- Never set `is_superadmin` from the public signup UI.
