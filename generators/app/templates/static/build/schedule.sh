#!/bin/bash

log="$(git log --all --max-count=1 --format=%ct --grep='Auto-Pull of Production')"
today=$(date +%s)
numDays=$(($((today-log))/60/60/24))
echo "The last sync was "$(git log --all --max-count=1 --format=%cr --grep='Auto-Pull of Production')

if [ -z "$PRODUCTION_SYNC_INTERVAL" ]
then
  PRODUCTION_SYNC_INTERVAL=3
fi
echo $PRODUCTION_SYNC_INTERVAL
if [ "$numDays" -lt "$PRODUCTION_SYNC_INTERVAL" ]
then
  echo "Sync is current. Exiting now."
else
  echo "=== Sync about to begin... ==="
  ./setup.sh
  ./sync.sh
  echo "=== Sync Complete ==="
  echo "*** Next Sync Schedule in $PRODUCTION_SYNC_INTERVAL days."
fi
   
