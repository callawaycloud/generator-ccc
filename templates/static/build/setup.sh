#!/bin/bash
set -euo pipefail

echo "=== Installing Salesforce CLI plugins ==="
echo "y" | sf plugins install sfdx-git-delta

echo "=== Authenticating to production org ==="
AUTH_FILE="$(mktemp)"
trap 'rm -f "$AUTH_FILE"' EXIT
echo "$AUTH_URL" > "$AUTH_FILE"
sf org login sfdx-url --sfdx-url-file "$AUTH_FILE" --set-default --alias prod

echo "=== Configuring git user for CI commits ==="
if [ -z "$(git config user.email 2>/dev/null || true)" ]; then
  git config user.email "pipeline-bot@bitbucket.org"
  git config user.name "Bitbucket Pipeline"
fi
