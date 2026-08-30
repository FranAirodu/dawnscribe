#!/usr/bin/env bash
# DawnScribe storage-only backup
#
# Downloads just the storage files (the paid art, covers, avatars, banners).
# Use this to fill in the storage folder of a backup whose database dump
# already succeeded -- no need to re-dump 48 MB.
#
# Usage:
#   bash ds-storage.sh /l/dawnscribe-backups/ds_2026-08-29_1738

set -uo pipefail

OUT="${1:-}"
if [[ -z "$OUT" ]]; then
  echo "ERROR: point me at an existing backup folder."
  echo "  bash ds-storage.sh /l/dawnscribe-backups/ds_2026-08-29_1738"
  exit 1
fi
if [[ ! -d "$OUT" ]]; then
  echo "ERROR: $OUT does not exist."
  exit 1
fi
if [[ -z "${DS_DB_URL:-}" ]]; then
  echo "ERROR: DS_DB_URL is not set in this window."
  exit 1
fi

mkdir -p "$OUT/storage"

echo "==> Reading file list from the database..."
psql "$DS_DB_URL" -At -c \
  "select bucket_id || '/' || name from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1;" \
  | tr -d '\r' > "$OUT/storage/FILELIST.txt"

TOTAL="$(grep -c . "$OUT/storage/FILELIST.txt")"
echo "    $TOTAL objects to fetch"

BASE="https://cajjyyskpmjnpcxcfeuk.supabase.co/storage/v1/object/public"
FAILED=0
N=0

while IFS= read -r OBJ; do
  OBJ="$(printf '%s' "$OBJ" | tr -d '\r')"
  [[ -z "$OBJ" ]] && continue
  N=$((N+1))
  TARGET="$OUT/storage/$OBJ"
  mkdir -p "$(dirname "$TARGET")"
  if curl -fsSL -g --path-as-is --retry 2 -o "$TARGET" "$BASE/$OBJ"; then
    printf '.'
  else
    echo ""
    echo "    MISS: $OBJ"
    FAILED=$((FAILED+1))
  fi
done < "$OUT/storage/FILELIST.txt"

echo ""
echo "==> fetched $((N-FAILED))/$N"

if [[ $FAILED -gt 0 ]]; then
  echo "    WARNING: $FAILED file(s) failed."
else
  echo "    All storage files backed up."
  du -sh "$OUT/storage" | awk '{print "    storage size: " $1}'
fi
