#!/usr/bin/env bash
# DawnScribe database backup
#
# Your external drive already holds the SITE CODE. This script saves the other
# half: the DATABASE (works, chapters, users, embers, badges, 169 tables,
# 429 functions, 527 policies, 21 cron jobs) plus the STORAGE FILES.
#
# Usage:
#   ./ds-backup.sh /Volumes/MyDrive/dawnscribe-backups
#
# Requires: pg_dump 15+  (macOS: brew install libpq && brew link --force libpq)
#                        (Windows: use Git Bash + PostgreSQL installer)
#
# Set DS_DB_URL once in your shell profile so the password never sits in a file:
#   export DS_DB_URL='postgresql://postgres:YOURPASSWORD@db.cajjyyskpmjnpcxcfeuk.supabase.co:5432/postgres'

set -euo pipefail

DEST="${1:-}"
if [[ -z "$DEST" ]]; then
  echo "ERROR: give me a destination folder."
  echo "  ./ds-backup.sh /Volumes/MyDrive/dawnscribe-backups"
  exit 1
fi

if [[ -z "${DS_DB_URL:-}" ]]; then
  echo "ERROR: DS_DB_URL is not set."
  echo "Get the connection string from Supabase dashboard:"
  echo "  Project Settings -> Database -> Connection string -> URI"
  echo "Then:  export DS_DB_URL='postgresql://postgres:...@db.cajjyyskpmjnpcxcfeuk.supabase.co:5432/postgres'"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install it, then re-run."
  exit 1
fi

STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$DEST/ds_$STAMP"
mkdir -p "$OUT"

echo "==> Backing up DawnScribe to $OUT"

# 1. ROLE-SAFE FULL DUMP -------------------------------------------------
# Custom format (-Fc) is compressed and restores selectively. This is the
# one that actually matters.
echo "  [1/5] full database (custom format)..."
pg_dump "$DS_DB_URL" \
  --format=custom \
  --no-owner --no-privileges \
  --exclude-schema='supabase_functions' \
  --exclude-schema='_realtime' \
  --exclude-schema='realtime' \
  --exclude-schema='pgbouncer' \
  --exclude-schema='extensions' \
  --exclude-schema='graphql*' \
  --exclude-schema='pgsodium*' \
  --exclude-schema='vault' \
  --file="$OUT/dawnscribe_full.dump"

# 2. PLAIN-TEXT SCHEMA ---------------------------------------------------
# Human-readable. Lets you diff two backups and see exactly what changed,
# and read a policy or function definition without restoring anything.
echo "  [2/5] readable schema (public)..."
pg_dump "$DS_DB_URL" \
  --schema-only --schema=public \
  --no-owner --no-privileges \
  --file="$OUT/schema_public.sql"

# 3. AUTH USERS ----------------------------------------------------------
# Accounts live in the auth schema, not public. Without this, a restore
# gives you works with no owners.
echo "  [3/5] auth schema (accounts)..."
pg_dump "$DS_DB_URL" \
  --schema=auth --no-owner --no-privileges \
  --file="$OUT/auth_schema.sql"

# 4. DATA-ONLY PUBLIC ----------------------------------------------------
# Useful for reseeding content into an already-built schema.
echo "  [4/5] public data only..."
pg_dump "$DS_DB_URL" \
  --data-only --schema=public \
  --no-owner --no-privileges \
  --file="$OUT/data_public.sql"

# 5. MANIFEST ------------------------------------------------------------
echo "  [5/5] manifest..."
{
  echo "DawnScribe backup"
  echo "taken:   $(date)"
  echo "project: cajjyyskpmjnpcxcfeuk"
  echo ""
  echo "files:"
  ls -lh "$OUT" | tail -n +2
} > "$OUT/MANIFEST.txt"

# Integrity check: a dump that won't list is a dump that won't restore.
echo "==> Verifying dump is readable..."
if pg_restore --list "$OUT/dawnscribe_full.dump" > "$OUT/contents.txt" 2>/dev/null; then
  echo "    OK - $(wc -l < "$OUT/contents.txt") objects in dump"
else
  echo "    FAILED - the dump is corrupt. DO NOT trust this backup."
  exit 1
fi

# 6. STORAGE FILES -------------------------------------------------------
# The paid art lives here: Myani's 6 banners, the 32 female/male body sheets,
# covers and avatars. None of it is in the SQL dump. All 6 buckets are public,
# so a plain download works. The file list is read live from the DB so it can
# never go stale.
echo "==> Backing up storage files..."
if command -v psql >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  mkdir -p "$OUT/storage"
  psql "$DS_DB_URL" -At -c \
    "select bucket_id || '/' || name from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1;" \
    > "$OUT/storage/FILELIST.txt"

  TOTAL="$(wc -l < "$OUT/storage/FILELIST.txt" | tr -d ' ')"
  echo "    $TOTAL objects to fetch"

  BASE="https://cajjyyskpmjnpcxcfeuk.supabase.co/storage/v1/object/public"
  FAILED=0
  N=0
  while IFS= read -r OBJ; do
    # psql on Windows emits CRLF; a trailing CR makes curl reject the URL
    # with "Malformed input to a URL function". Strip it.
    OBJ="$(printf '%s' "$OBJ" | tr -d '\r')"
    [[ -z "$OBJ" ]] && continue
    N=$((N+1))
    TARGET="$OUT/storage/$OBJ"
    mkdir -p "$(dirname "$TARGET")"
    # --path-as-is keeps the path intact; -g stops curl treating {} [] as globs
    if ! curl -fsSL -g --path-as-is --retry 2 -o "$TARGET" "$BASE/$OBJ"; then
      echo "    MISS: $OBJ"
      FAILED=$((FAILED+1))
    fi
  done < "$OUT/storage/FILELIST.txt"

  echo "    fetched $((N-FAILED))/$N"
  if [[ $FAILED -gt 0 ]]; then
    echo "    WARNING: $FAILED file(s) failed to download."
  fi
else
  echo "    SKIPPED: needs psql and curl. Download manually from"
  echo "    Supabase dashboard -> Storage (6 buckets, ~60 objects)."
fi

SIZE="$(du -sh "$OUT" | cut -f1)"
echo ""
echo "==> Done. $SIZE written to $OUT"
echo "    Keep at least the last 3 backups. Test a restore twice a year."
