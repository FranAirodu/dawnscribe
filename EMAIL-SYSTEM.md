# DawnScribe — Email System

**Last verified:** 2026-08-11 (against the live DB, not from notes)

Goal: **send as few emails as possible.** Resend's free tier is 100/day and
**Auth SMTP shares that same allowance** — so digest volume can starve signup
confirmations and password resets. Every decision below serves keeping the
count low.

---

## There are THREE email systems, not one

This is the thing to remember. Turning off one does not silence the others.

| System | What sends it | Controlled by | Silenceable by `email_worthy`? |
|---|---|---|---|
| **1. Daily digest** | `email-digest-cron` (pg_cron `daily-email-digest`, 13:00 UTC) | `notification_types.email_worthy` | **Yes** |
| **2. Transactional** | `stripe-payout-cron`, `request-payout` → `send-email` | per-user `profiles.email_payouts` | **No** |
| **3. Auth mail** | Supabase Auth → Resend SMTP | Supabase Auth settings | **No** |

### Setting every `email_worthy` to false does NOT make DawnScribe silent.
Payout mail and signup/password-reset mail both keep sending. They are
deliberately outside that switch.

---

## 1. Daily digest — the volume risk

- **Current state: 1 of 51 notification types is `email_worthy`** — `admin_warning` only.
  Everything else is in-app only.
- `email_worthy` defaults to **false**, so a newly added notification type is
  silent until someone explicitly opts it in. Correct direction on a tight quota.
- Cap is **20/day**, passed as `{"cap":20}` in the cron body. `get_email_digest_batch`
  clamps 0–100.
- Fair ordering: `last_digest_at ASC NULLS FIRST, notif_count DESC`. Deferred users
  lead the next batch, so nobody is starved forever (the old query had no ORDER BY,
  which meant the same users always lost).
- `count_email_digest_candidates()` gives the uncapped figure; `email_quota_log` +
  `record_email_quota()` make hitting the ceiling visible as data.

**To go fully silent on social/activity mail:** set all `email_worthy` to false.
That is the switch. It does not touch payouts or auth.

## 2. Transactional (payouts)

- Fires at most **once per creator per month** — negligible against quota.
- Bypasses `email_worthy` **on purpose**: "we sent you $40" is about someone's
  money, not social noise, and should not be silenced by a volume setting.
- Users **can** still opt out: `get_user_email_for_payout` returns
  `email_ok = (profiles.email_enabled AND profiles.email_payouts)` and the sender
  skips when false. Both have working toggles in `settings.html`.
- Sent via the internal `send-email` function, authorised by `CRON_SECRET`.

## 3. Auth mail — protect this one

Signup confirmations and password resets go out over Resend SMTP
(smtp.resend.com, port 465) and draw on the **same 100/day**. If the digest eats
the allowance, **new users cannot register.** This is the mail that must always work.

---

## `send-email` (internal only)

- `verify_jwt: false`, authorised by `Authorization: Bearer ${CRON_SECRET}`; fails
  closed if `CRON_SECRET` is unset.
- Accepts an arbitrary `to` and arbitrary `body_html`, so **that one secret can send
  any HTML from noreply@dawnscribe.com.** Treat it as a phishing-grade credential,
  not just a cron trigger.
- `CRON_SECRET` is **shared** across `send-email`, `stripe-payout-cron`, and
  `email-digest-cron`. One leak affects all three. It also lives in the pg_cron job
  commands — rotating it means updating every location at once or mail breaks.
- Deliberately NOT changed: the secret is compared with `!==` rather than a
  constant-time compare. The timing signal is microseconds under milliseconds of
  network jitter, so it is not practically exploitable; redeploying three live
  functions was judged the larger risk. If hardening later, the better first move is
  giving `send-email` its own separate secret so a leak cannot reach the payout job.
- Sends are logged to `email_log` when `user_id` and `kind` are supplied.

## Knobs, in one place

- `notification_types.email_worthy` — per-type digest opt-in (currently only `admin_warning`)
- pg_cron `daily-email-digest` body `cap` — daily digest ceiling (currently 20)
- `profiles.email_enabled` — user master switch
- `profiles.email_payouts` — user payout-mail switch
- `profiles.email_digest` — user digest switch
- `email_unsub_tokens` — one-click unsubscribe links
