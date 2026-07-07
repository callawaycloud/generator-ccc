#!/bin/bash
set -euo pipefail

echo "=== Syncing production into {{defaultBranch}} ==="
set -x
git fetch

git checkout "{{defaultBranch}}"

if [ "${1:-}" != "1" ]; then
  # Clear package directories first so components deleted in the org
  # show up as git deletions (retrieve alone never removes files).
  while IFS= read -r pkg_dir; do
    rm -rf "$pkg_dir"
    mkdir -p "$pkg_dir"
  done < <(jq -r ".packageDirectories[].path" sfdx-project.json)
  sf project retrieve start --manifest manifest/package.xml --ignore-conflicts
  git status
  git add -A
  git commit -m "[skip ci] Auto-Pull of Production" || echo "No changes to commit"

  if [ "${SYNC_AS_PR:-}" = "1" ]; then
    SYNC_BRANCH="production-sync-$(date +%Y%m%d)"
    git checkout -b "$SYNC_BRANCH"
    git push -u origin "$SYNC_BRANCH"
    set +x
    if ! curl --fail --show-error -s -X POST \
      -H "Content-Type: application/json" \
      -u "${BITBUCKET_USERNAME}:${BITBUCKET_APP_PASSWORD}" \
      "https://api.bitbucket.org/2.0/repositories/${BITBUCKET_REPO_OWNER}/${BITBUCKET_REPO_SLUG}/pullrequests" \
      -d "$(jq -n \
        --arg title "Production changes since last sync" \
        --arg source "$SYNC_BRANCH" \
        --arg dest "{{defaultBranch}}" \
        '{title: $title, source: {branch: {name: $source}}, destination: {branch: {name: $dest}}}')"; then
      echo "ERROR: Failed to create pull request for branch ${SYNC_BRANCH}" >&2
      exit 1
    fi
    set -x
    echo "Opened PR for branch ${SYNC_BRANCH}"
  else
    git push
  fi
fi

git checkout "$BITBUCKET_BRANCH"
set +x

echo "=== Next steps ==="
echo "Production sync complete. If your branch now has conflicts with {{defaultBranch}}, resolve them locally and push."
