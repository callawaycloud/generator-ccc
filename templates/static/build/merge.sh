#!/bin/bash
set -euo pipefail

echo "=== Verifying deployment succeeded ==="
DEPLOY_SUCCESS="$(sf project deploy report --job-id "$(cat dist/deploy_id.txt)" --json | jq -r '.result.success')"
if [ "$DEPLOY_SUCCESS" != "true" ]; then
  echo "Deployment failed (job id: $(cat dist/deploy_id.txt)). Aborting merge."
  exit 1
fi

echo "=== Merging branch into {{defaultBranch}} ==="
git checkout "{{defaultBranch}}"
git pull origin "{{defaultBranch}}"
git merge "$BITBUCKET_BRANCH"
git push
if [ "$BITBUCKET_BRANCH" != "{{defaultBranch}}" ]; then
  git push origin --delete "$BITBUCKET_BRANCH"
fi

echo "=== Next steps ==="
if [ "$BITBUCKET_BRANCH" != "{{defaultBranch}}" ]; then
  echo "Deployed and merged into {{defaultBranch}}. The feature branch has been deleted — you're done."
else
  echo "Deployed to production from {{defaultBranch}} — you're done."
fi
