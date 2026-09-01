# DawnScribe — Restore Drill Baseline (refreshed 2026-09-01)

Replaces the baseline block in `ds-restore-drill.md`. The procedure in that
document is unchanged — only these numbers are.

Server PG **17.6**. Local `pg_dump` must be **17 or newer** or the dump will be
rejected outright.

---

## Why this file spells out the queries

The old baseline listed numbers without the queries that produced them, and two
of them are ambiguous enough to fake a failed restore:

- **Table grants** counted `anon` + `authenticated` + `service_role`.
- **Column grants** counted only `anon` + `authenticated`.

Different grantee sets, same list. Counting all grantees instead gives 2835 and
13931 — both "wrong" against the old baseline, and both perfectly healthy. Run
the exact queries below and the comparison means something.

---

## Baseline

| Metric | Value | Was |
|---|---|---|
| Tables (`public`, ordinary) | **169** | 169 |
| Functions (`public`) | **430** | 429 |
| Policies (`public`) | **527** | 527 |
| Policies (`storage`) | **17** | 17 |
| Triggers (`public`, non-internal) | **85** | 85 |
| Table grants (anon+authenticated+service_role) | **1652** | 1652 |
| Column grants (anon+authenticated) | **3307** | 3307 |
| `anon` EXECUTE | **87** | 85 |
| `authenticated` EXECUTE | **279** | 275 |
| CHECK constraints (`public`) | **274** | — |
| Auth users | **5** | 5 |
| Storage objects | **56** | 60 |
| Cron jobs | **21** | 21 |

### What moved, and why

- **Storage objects 60 → 56.** The orphan sweep deleted 4: three cover images
  from the works deleted in handoff 33, plus the superseded `banner.jpg`.
- **Functions 429 → 430.** `ds_check_trigger_grant_gaps()`.
- **EXECUTE counts +2 / +4.** Drift from recent sessions. Note the new checker
  is *not* among them — it is revoked from both roles by design.
- **CHECK constraints** is a new line. It is the cheapest way to catch a restore
  that silently dropped constraints, which is the same failure class as the
  `--no-privileges` defect: the thing looks fine because nobody counts it.

---

## The query

Run against the restored database and compare all thirteen at once.

```sql
select
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r')            as tables,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public')                                as functions,
  (select count(*) from pg_policies where schemaname = 'public')  as policies_public,
  (select count(*) from pg_policies where schemaname = 'storage') as policies_storage,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal)         as triggers,
  (select count(*) from information_schema.table_privileges
    where table_schema = 'public'
      and grantee in ('anon','authenticated','service_role'))  as table_grants,
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public'
      and grantee in ('anon','authenticated'))                 as column_grants,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE'))    as anon_exec,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')) as auth_exec,
  (select count(*) from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and k.contype = 'c')            as check_constraints,
  (select count(*) from auth.users)                            as auth_users,
  (select count(*) from storage.objects)                       as storage_objects,
  (select count(*) from cron.job)                              as cron_jobs;
```

---

## Expected differences after a restore — not failures

- **`cron_jobs = 0`.** The extension is owned by a different role in a fresh
  instance. Recreate the 21 jobs by hand; the list is in `ds-restore-drill.md`.
- **Storage rows restore without their bytes.** `storage.objects` will show 56
  rows pointing at objects that are not in the new bucket. Restore those from
  the `ds-storage.sh` download.
- **Anything dumped before 2026-08-31 carries the `--no-privileges` defect.**
  Grants will be absent while policies restore normally, so `policies_public`
  reads 527 and looks correct. **Check `table_grants` and `column_grants` before
  trusting any older backup.** Keep those dumps for row data only.

---

## One functional check the counts cannot give you

Counts confirm objects exist. They do not confirm the site works. After
restoring, run this — it is the fault that broke every avatar and cover write
and no count would have shown it:

```sql
select * from public.ds_check_trigger_grant_gaps();  -- expect 0 rows
select * from public.ds_check_policy_grant_gaps();   -- expect 0 rows
```
