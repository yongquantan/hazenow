#!/usr/bin/env bash
# Download every attachment (recordings, annotation JSON, screenshots, reports) from Devin QA sessions.
#   scripts/devin-qa-recordings.sh SURFACE:SESSION_ID [...]
# Files land in .qa-runs/recordings/<surface>/ (gitignored). Re-runs skip files already downloaded.
set -euo pipefail
: "${DEVIN_API_KEY:?}" "${DEVIN_ORG_ID:?}"
API="https://api.devin.ai/v3/organizations/$DEVIN_ORG_ID"
OUT="$(dirname "$0")/../.qa-runs/recordings"

for pair in "$@"; do
  surface="${pair%%:*}"; id="${pair#*:}"; [[ $id == devin-* ]] || id="devin-$id"
  mkdir -p "$OUT/$surface"
  curl -sS -f -H "Authorization: Bearer $DEVIN_API_KEY" "$API/sessions/$id/attachments" > "$OUT/$surface/_attachments.json"
  # Keep the message log too: it carries each recording's annotation ids and Devin's narrative.
  curl -sS -f -H "Authorization: Bearer $DEVIN_API_KEY" "$API/sessions/$id/messages" > "$OUT/$surface/_messages.json"
  jq -r '.[] | [.attachment_id, .name] | @tsv' "$OUT/$surface/_attachments.json" |
  while IFS=$'\t' read -r aid name; do
    dest="$OUT/$surface/$name"
    [[ -s $dest ]] && continue
    curl -sS -f -L --max-time 600 -H "Authorization: Bearer $DEVIN_API_KEY" -o "$dest" "$API/attachments/$aid/$name" \
      && echo "$surface  $(du -h "$dest" | cut -f1)  $name" \
      || { echo "$surface  FAILED  $name" >&2; rm -f "$dest"; }
  done
  # Each recording's timestamped checkpoints (test labels with source/edited times) are a separate
  # attachment referenced only from the message that carried the video.
  jq -r '.items[].message' "$OUT/$surface/_messages.json" | grep -o '^ATTACHMENT:{.*}' | sed 's/^ATTACHMENT://' |
  jq -r 'select(.annotationsAttachmentUuid) | [(.url | split("/") | last | sub("\\.mp4$"; "")), .annotationsAttachmentUuid] | @tsv' |
  while IFS=$'\t' read -r rec aid; do
    dest="$OUT/$surface/$rec.annotations.json"
    [[ -s $dest ]] && continue
    curl -sS -f -L -H "Authorization: Bearer $DEVIN_API_KEY" -o "$dest" "$API/attachments/$aid/annotations.json" \
      && echo "$surface  annotations  $rec" || { echo "$surface  FAILED  annotations $rec" >&2; rm -f "$dest"; }
  done
done
