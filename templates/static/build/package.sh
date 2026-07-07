#!/bin/bash
set -euo pipefail

echo "=== Merging {{defaultBranch}} into branch ==="
git merge "origin/{{defaultBranch}}"

echo "=== Building delta package with sfdx-git-delta ==="
mkdir -p dist
sf sgd source delta --from "origin/{{defaultBranch}}" --to HEAD --output-dir dist --generate-delta

echo "=== Package manifest ==="
cat dist/package/package.xml

if [ -f dist/destructiveChanges/destructiveChanges.xml ]; then
  echo "=== Destructive changes ==="
  cat dist/destructiveChanges/destructiveChanges.xml
fi

# shellcheck source=lib/package-stats.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/package-stats.sh"

echo "=== Next steps ==="
TOTAL="$(package_total "dist/package/package.xml")"
if [ "$TOTAL" -eq 0 ]; then
  echo "No deployable changes detected between this branch and {{defaultBranch}}."
else
  echo "Package built with ${TOTAL} components. Next: click 'Check Package' on this pipeline when you're ready to validate against production."
fi
