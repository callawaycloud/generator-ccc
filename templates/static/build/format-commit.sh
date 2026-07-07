#!/bin/bash
set -euo pipefail

branchName="$(git rev-parse --abbrev-ref HEAD)"

if [ "$branchName" = "{{defaultBranch}}" ]; then
  echo "Skip Format on {{defaultBranch}} Branch"
  exit 0
fi

npm run pretty-quick
