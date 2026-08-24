#!/bin/bash
set -euo pipefail

echo "=== Merging {{defaultBranch}} into branch ==="
git merge "origin/{{defaultBranch}}"

echo "=== Building delta package with sfdx-git-delta ==="
mkdir -p dist
sf sgd source delta --from "origin/{{defaultBranch}}" --to HEAD --output-dir dist --generate-delta

# shellcheck source=lib/package-stats.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/package-stats.sh"

# Strip empty destructiveChanges/ from artifacts unless real deletions are present
DESTRUCTIVE_XML="dist/destructiveChanges/destructiveChanges.xml"
if [ -f "$DESTRUCTIVE_XML" ] && grep -q '<members>' "$DESTRUCTIVE_XML"; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!! DESTRUCTIVE CHANGES DETECTED !!!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  echo "Summary: $(friendly_summary "$DESTRUCTIVE_XML")"
  echo ""
  echo "=== Destructive changes (raw XML) ==="
  cat "$DESTRUCTIVE_XML"
  echo ""
  echo "Check Package and deploy are BLOCKED until you confirm deletions."
  echo "Add !confirmDelete to the PR description, or set ConfirmDeletions=DELETE on custom Deploy pipelines."
else
  rm -rf dist/destructiveChanges
fi

echo "=== Package manifest ==="
cat dist/package/package.xml

echo "=== Next steps ==="
TOTAL="$(package_total "dist/package/package.xml")"
if [ -f "$DESTRUCTIVE_XML" ]; then
  echo "Package includes metadata deletions ($(friendly_summary "$DESTRUCTIVE_XML"))."
  echo "Check Package and custom Deploy pipelines will FAIL until you confirm: add !confirmDelete to the PR description, or set ConfirmDeletions=DELETE on custom Deploy pipelines."
  if [ "$TOTAL" -gt 0 ]; then
    echo "Also includes ${TOTAL} components to add or update."
  fi
elif [ "$TOTAL" -eq 0 ]; then
  echo "No deployable changes detected between this branch and {{defaultBranch}}."
else
  echo "Package built with ${TOTAL} components. Next: click 'Check Package' on this pipeline when you're ready to validate against production."
fi
