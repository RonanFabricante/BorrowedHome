# Superadmin console

Internal ops UI at `/admin` for platform operators.

## Setup

1. Apply migrations `032_superadmin_and_audit.sql`, `033_listing_reports_and_suspension.sql`, and `034_privilege_and_stripe_hardening.sql` in Supabase SQL Editor.
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
| Overview | KPIs: stuck payments, disputes, open reports, listings, incomplete Connect |
| Bookings | Filter; force status (COMPLETED / CANCELLED / EXPIRED / CONFIRMED / DECLINED) with reason |
| Payments | Sync from Stripe; capture + transfer; release deposit; clear dispute hold |
| Listings | Publish / unpublish |
| Reports | Listing report inbox; dismiss / review / unpublish / suspend host |
| Hosts | Connect status; suspend / unsuspend user (suspend unpublishes their listings) |
| Audit | `admin_actions` log |

All mutations go through `/api/admin/*` (session + `is_superadmin` check) and use the service-role client. Every write is audited.

Migration **034** locks `is_superadmin` / `is_suspended` and host Stripe Connect columns from client updates (service role only). Set superadmin only via SQL Editor / service role.

## Notes

- Capture + transfer is safe if the PaymentIntent is already `succeeded` (skips capture, retries transfer with idempotency key `booking-payout-{bookingId}`).
- Transfer can still fail if the platform Stripe balance is too low (common on tiny test charges after fees).
- Never set `is_superadmin` from the public signup UI.
