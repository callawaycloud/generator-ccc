#!/bin/bash
# Blocks Salesforce validate/deploy when the delta package includes metadata
# deletions, unless the caller passed "1" as the first argument (confirmed).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/package-stats.sh
source "${SCRIPT_DIR}/lib/package-stats.sh"

DESTRUCTIVE_XML="dist/destructiveChanges/destructiveChanges.xml"
CONFIRMED="${1:-}"

_has_destructive_deletions() {
  [ -f "$DESTRUCTIVE_XML" ] && grep -q '<members>' "$DESTRUCTIVE_XML"
}

# Print a high-visibility line to pipeline logs.
_loud() {
  echo "$@"
}

_print_destructive_xml() {
  echo "=== Destructive changes (raw XML) ==="
  cat "$DESTRUCTIVE_XML"
}

if ! _has_destructive_deletions; then
  exit 0
fi

if [ "$CONFIRMED" = "1" ]; then
  _loud ""
  _loud "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  _loud "!!! DESTRUCTIVE CHANGES CONFIRMED — PROCEEDING WITH DELETE !!!"
  _loud "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  _loud ""
  _loud "Summary: $(friendly_summary "$DESTRUCTIVE_XML")"
  _loud ""
  _print_destructive_xml
  _loud ""
  exit 0
fi

_loud ""
_loud "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
_loud "!!! DESTRUCTIVE CHANGES BLOCKED !!!"
_loud "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
_loud ""
_loud "This deployment would DELETE the following Salesforce metadata:"
_loud ""
_loud "Summary: $(friendly_summary "$DESTRUCTIVE_XML")"
_loud ""
_print_destructive_xml
_loud ""
_loud "WARNING: This removes metadata from your Salesforce org — not just files in git."
_loud "Deleting custom fields or objects can permanently destroy data in production."
_loud "Renaming an API name counts as delete + create, not an in-place rename."
_loud ""
_loud "To confirm and allow this deployment:"
_loud "  - Pull request: add !confirmDelete to the PR description, then re-run Check Package."
_loud "  - Custom Deploy to Production pipelines: re-run and set ConfirmDeletions to exactly DELETE."
_loud ""
exit 1
