#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/package-stats.sh
source "${SCRIPT_DIR}/lib/package-stats.sh"
# shellcheck source=lib/annotations.sh
source "${SCRIPT_DIR}/lib/annotations.sh"

PACKAGE_XML="dist/package/package.xml"
DESTRUCTIVE_XML="dist/destructiveChanges/destructiveChanges.xml"
DEPLOY_ID_FILE="dist/deploy_id.txt"

usage() {
  echo "Usage: $(basename "$0") package|validation|analysis" >&2
  return 1
}

_has_destructive_members() {
  [ -f "$DESTRUCTIVE_XML" ] && grep -q '<members>' "$DESTRUCTIVE_XML"
}

_metadata_types_text() {
  local stats
  stats="$(package_stats "$PACKAGE_XML")"
  if [ -z "$stats" ]; then
    echo "none"
    return 0
  fi

  echo "$stats" | awk -F '\t' '{printf "%s%s (%s)", (NR > 1 ? ", " : ""), $1, $2}'
}

_publish_report() {
  local report_id="$1"
  local payload="$2"

  if ! curl --silent --show-error --fail --proxy 'http://localhost:29418' \
    -X PUT \
    -H "Content-Type: application/json" \
    "http://api.bitbucket.org/2.0/repositories/${BITBUCKET_REPO_OWNER}/${BITBUCKET_REPO_SLUG}/commit/${BITBUCKET_COMMIT}/reports/${report_id}" \
    -d "$payload"; then
    echo "WARN: failed to publish Code Insights report ${report_id}" >&2
    return 1
  fi
}

package_report() {
  local total
  local metadata_types
  local has_destructive="false"
  local deletion_count=0
  local result="FAILED"
  local details="Incremental package built by sfdx-git-delta"
  local payload

  total="$(package_total "$PACKAGE_XML")"
  metadata_types="$(_metadata_types_text)"

  if _has_destructive_members; then
    has_destructive="true"
    deletion_count="$(package_total "$DESTRUCTIVE_XML")"
  fi

  # The details text renders on the PR card, so it carries the human-readable
  # summary — visible without any repository variables configured.
  if [ "$total" -gt 0 ]; then
    result="PASSED"
    details="This deployment contains: $(friendly_summary "$PACKAGE_XML")."
    if [ "$has_destructive" = "true" ]; then
      details="${details} Deletions: $(friendly_summary "$DESTRUCTIVE_XML")."
    fi
  else
    details="No deployable changes detected"
  fi

  payload="$(jq -n \
    --arg report_type "TEST" \
    --arg title "Deployment Package" \
    --arg details "$details" \
    --arg result "$result" \
    --argjson component_count "$total" \
    --arg metadata_types "$metadata_types" \
    --argjson has_destructive "$has_destructive" \
    --argjson deletion_count "$deletion_count" \
    '{
      report_type: $report_type,
      title: $title,
      details: $details,
      result: $result,
      data: (
        [
          {title: "Components", type: "NUMBER", value: $component_count},
          {title: "Metadata types", type: "TEXT", value: $metadata_types},
          {title: "Destructive changes", type: "BOOLEAN", value: $has_destructive}
        ]
        + (if $has_destructive then [{title: "Deletions", type: "NUMBER", value: $deletion_count}] else [] end)
      )
    }')"

  _publish_report "ccc-package" "$payload" || return 1
  echo "Published Code Insights report: ccc-package"
}

validation_report() {
  local job_id
  local deploy_json
  local success
  local tests_completed
  local test_errors
  local components_deployed
  local code_coverage
  local result
  local payload

  if [ ! -f "$DEPLOY_ID_FILE" ]; then
    echo "Skipping validation report: ${DEPLOY_ID_FILE} not found"
    return 0
  fi

  job_id="$(cat "$DEPLOY_ID_FILE")"
  deploy_json="$(sf project deploy report --job-id "$job_id" --json || true)"

  success="$(echo "$deploy_json" | jq -r '.result.success')"
  tests_completed="$(echo "$deploy_json" | jq -r '.result.numberTestsCompleted // 0')"
  test_errors="$(echo "$deploy_json" | jq -r '.result.numberTestErrors // 0')"
  components_deployed="$(echo "$deploy_json" | jq -r '.result.numberComponentsDeployed // 0')"
  code_coverage="$(echo "$deploy_json" | jq -r '
    .result.details.runTestResult.codeCoverage
    | if type == "array" and length > 0 then
        (map(
          if .numLocations > 0 then
            ((.numLocations - .numLocationsNotCovered) / .numLocations * 100)
          else
            0
          end
        ) | add / length * 10 | round / 10 | tostring) + "%"
      else
        "n/a"
      end
  ')"

  if [ "$success" = "true" ]; then
    result="PASSED"
  else
    result="FAILED"
  fi

  payload="$(jq -n \
    --arg report_type "TEST" \
    --arg title "Validation Results" \
    --arg details "Salesforce validation deployment results" \
    --arg result "$result" \
    --argjson tests_completed "$tests_completed" \
    --argjson test_errors "$test_errors" \
    --argjson components_deployed "$components_deployed" \
    --arg code_coverage "$code_coverage" \
    '{
      report_type: $report_type,
      title: $title,
      details: $details,
      result: $result,
      data: [
        {title: "Tests run", type: "NUMBER", value: $tests_completed},
        {title: "Test failures", type: "NUMBER", value: $test_errors},
        {title: "Components deployed", type: "NUMBER", value: $components_deployed},
        {title: "Code coverage", type: "TEXT", value: $code_coverage}
      ]
    }')"

  _publish_report "ccc-validation" "$payload" || return 1
  echo "Published Code Insights report: ccc-validation"

  local deploy_ann test_ann combined
  deploy_ann="$(deploy_failure_annotations "$deploy_json" || echo "[]")"
  test_ann="$(test_failure_annotations "$deploy_json" || echo "[]")"
  combined="$(jq -n --argjson a "$deploy_ann" --argjson b "$test_ann" '$a + $b')"
  if ! publish_annotations "ccc-validation" "$combined"; then
    echo "WARN: failed to publish validation annotations" >&2
  fi
}

analysis_report() {
  local results_path="dist/code-analysis/results.json"
  local total critical_high medium low_info payload annotations

  if [ ! -f "$results_path" ]; then
    echo "Skipping analysis report: dist/code-analysis/results.json not found"
    return 0
  fi

  total="$(jq -r ".violationCounts.total // (.violations | length)" "$results_path")"
  critical_high="$(jq "[.violations[]? | select(.severity == 1 or .severity == 2)] | length" "$results_path")"
  medium="$(jq "[.violations[]? | select(.severity == 3)] | length" "$results_path")"
  low_info="$(jq "[.violations[]? | select(.severity == 4 or .severity == 5)] | length" "$results_path")"

  local result="PASSED"
  if [ "$critical_high" -gt 0 ]; then
    result="FAILED"
  fi

  payload="$(jq -n \
    --arg report_type "TEST" \
    --arg title "Code Analysis" \
    --arg details "Salesforce Code Analyzer findings for changed files" \
    --arg result "$result" \
    --argjson total "$total" \
    --argjson critical_high "$critical_high" \
    --argjson medium "$medium" \
    --argjson low_info "$low_info" \
    '{
      report_type: $report_type,
      title: $title,
      details: $details,
      result: $result,
      data: [
        {title: "Total violations", type: "NUMBER", value: $total},
        {title: "Critical/High", type: "NUMBER", value: $critical_high},
        {title: "Medium", type: "NUMBER", value: $medium},
        {title: "Low/Info", type: "NUMBER", value: $low_info}
      ]
    }')"

  _publish_report "ccc-analysis" "$payload" || return 1
  echo "Published Code Insights report: ccc-analysis"

  annotations="$(analyzer_annotations "$results_path")"
  publish_annotations "ccc-analysis" "$annotations" || return 1
}

main() {
  local mode="${1:-}"

  if [ -z "${BITBUCKET_COMMIT:-}" ]; then
    echo "Skipping Code Insights report: BITBUCKET_COMMIT is not set"
    return 0
  fi

  case "$mode" in
    package)
      package_report
      ;;
    validation)
      validation_report
      ;;
    analysis)
      analysis_report
      ;;
    *)
      usage
      ;;
  esac
}

if ! main "$@"; then
  echo "WARN: could not publish Code Insights report"
fi
exit 0
