#!/bin/bash
set -euo pipefail

set -x
secondsSinceSync="$(git log --all --max-count=1 --format=%ct --grep='Auto-Pull of Production' 2>/dev/null || true)"
today="$(date +%s)"

if [ -z "$secondsSinceSync" ]; then
  echo "=== No prior sync commit found; running sync ==="
  numDays=999
else
  numDays=$(( (today - secondsSinceSync) / 60 / 60 / 24 ))
  echo "The last sync was $(git log --all --max-count=1 --format=%cr --grep='Auto-Pull of Production' 2>/dev/null || echo 'unknown')"
fi

if [ -z "${PRODUCTION_SYNC_INTERVAL:-}" ]; then
  PRODUCTION_SYNC_INTERVAL=3
fi
echo "The PRODUCTION_SYNC_INTERVAL is ${PRODUCTION_SYNC_INTERVAL} days"

if [ "$numDays" -lt "$PRODUCTION_SYNC_INTERVAL" ]; then
  echo "=== Sync is current. Exiting now. ==="
  echo "*** Next Sync Schedule in $((PRODUCTION_SYNC_INTERVAL - numDays)) days."
else
  echo "=== Sync about to begin... ==="
  bash build/setup.sh
  bash build/sync.sh
  echo "=== Sync Complete ==="
  echo "*** Next Sync Scheduled in ${PRODUCTION_SYNC_INTERVAL} days."
fi
set +x
