#!/bin/bash
set -x;
secondsSinceSync="$(git log --all --max-count=1 --format=%ct --grep='Auto-Pull of Production')"
today=$(date +%s)
numDays=$(($((today-secondsSinceSync))/60/60/24))
echo "The last sync was "$(git log --all --max-count=1 --format=%cr --grep='Auto-Pull of Production')

if [ -z "$PRODUCTION_SYNC_INTERVAL" ]
then
  PRODUCTION_SYNC_INTERVAL=3
fi
echo "The PRODUCTION_SYNC_INTERVAL is $PRODUCTION_SYNC_INTERVAL days"
if [ "$numDays" -lt "$PRODUCTION_SYNC_INTERVAL" ]
then
  echo "=== Sync is current. Exiting now. ==="
  echo "*** Next Sync Schedule in $((PRODUCTION_SYNC_INTERVAL-numDays)) days."
else
  echo "=== Sync about to begin... ==="
  ./build/setup.sh
  ./build/updateApiVersion.sh
  ./build/sync.sh
  echo "=== Sync Complete ==="
  echo "*** Next Sync Scheduled in $PRODUCTION_SYNC_INTERVAL days."
fi
set +x;
