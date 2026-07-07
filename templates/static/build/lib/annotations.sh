#!/bin/bash
# Sourced library — do not execute directly. Caller must not rely on errexit here.

# POST annotation batches to Bitbucket Code Insights (best-effort).
publish_annotations() {
  local report_id="$1"
  local annotations_json="$2"
  local count sorted published batch_size

  count="$(echo "$annotations_json" | jq 'length')"
  if [ "$count" -eq 0 ]; then
    echo "No annotations to publish for ${report_id}"
    return 0
  fi

  sorted="$(echo "$annotations_json" | jq '
    def severity_rank:
      if . == "CRITICAL" then 0
      elif . == "HIGH" then 1
      elif . == "MEDIUM" then 2
      elif . == "LOW" then 3
      else 4
      end;
    sort_by(.severity | severity_rank) | .[0:1000]
  ')"

  published=0
  while IFS= read -r batch; do
    if ! curl --silent --show-error --fail --proxy "http://localhost:29418" \
      -X POST \
      -H "Content-Type: application/json" \
      "http://api.bitbucket.org/2.0/repositories/${BITBUCKET_REPO_OWNER}/${BITBUCKET_REPO_SLUG}/commit/${BITBUCKET_COMMIT}/reports/${report_id}/annotations" \
      -d "$batch"; then
      echo "WARN: failed to publish annotations for ${report_id}" >&2
      return 1
    fi
    batch_size="$(echo "$batch" | jq 'length')"
    published=$((published + batch_size))
  done < <(echo "$sorted" | jq -c '
    def batches($n): . as $all | [range(0; length; $n)] | map($all[. : . + $n]) | .[];
    batches(100)
  ')

  echo "Published ${published} annotations for ${report_id}"
}

# Emit Bitbucket annotations from a Salesforce Code Analyzer v5 results file.
analyzer_annotations() {
  local results_path="$1"

  if [ ! -f "$results_path" ]; then
    echo "[]"
    return 0
  fi

  local run_dir cwd clone_dir
  run_dir="$(jq -r '.runDir // ""' "$results_path")"
  cwd="$(pwd)"
  clone_dir="${BITBUCKET_CLONE_DIR:-}"

  jq \
    --arg runDir "$run_dir" \
    --arg cwd "$cwd" \
    --arg cloneDir "$clone_dir" \
    '
    def strip_prefix($s; $prefix):
      if $prefix == "" then $s
      elif ($s | startswith($prefix + "/")) then $s[($prefix | length + 1):]
      elif ($s | startswith($prefix)) then $s[($prefix | length):]
      else $s
      end;

    def normalize_path($file):
      if $file == null or $file == "" then ""
      else
        $file
        | sub("^file://"; "")
        | strip_prefix(.; $runDir)
        | strip_prefix(.; "/" + $cloneDir)
        | strip_prefix(.; $cloneDir)
        | strip_prefix(.; "/" + $cwd)
        | strip_prefix(.; $cwd)
        | sub("^\\./"; "")
        | sub("^/+"; "")
      end;

    def map_severity($n):
      if $n == 1 then "CRITICAL"
      elif $n == 2 then "HIGH"
      elif $n == 3 then "MEDIUM"
      else "LOW"
      end;

    (.violations // [])
    | to_entries
    | map(
        . as $entry
        | $entry.value
        | .locations[.primaryLocationIndex // 0] as $loc
        | normalize_path($loc.file // "") as $path
        | select($path != "")
        | {
            external_id: ("ccc-analysis-" + (($entry.key + 1) | tostring)),
            annotation_type: "CODE_SMELL",
            summary: (
              ((.rule // "unknown") + " (" + (.engine // "unknown") + "): " + (.message // ""))
              | .[0:450]
            ),
            severity: map_severity(.severity // 5),
            path: $path,
            line: ($loc.startLine // 0)
          }
      )
    ' "$results_path"
}

# Locate a repo-relative path under src/ by file basename.
_repo_path_for_basename() {
  local basename="$1"
  find src -name "$basename" -not -path "*/node_modules/*" -print -quit 2>/dev/null
}

# Emit annotations for deploy component failures. Input: sf project deploy report --json output (string).
deploy_failure_annotations() {
  local deploy_json="$1"
  local annotations="[]"
  local idx=0
  local failure

  while IFS= read -r failure; do
    [ -z "$failure" ] && continue

    local full_name component_type problem problem_type file_name line_number
    full_name="$(echo "$failure" | jq -r '.fullName // ""')"
    component_type="$(echo "$failure" | jq -r '.componentType // ""')"
    problem="$(echo "$failure" | jq -r '.problem // ""')"
    problem_type="$(echo "$failure" | jq -r '.problemType // "Error"')"
    file_name="$(echo "$failure" | jq -r '.fileName // ""')"
    line_number="$(echo "$failure" | jq -r '(.lineNumber | tonumber?) // 0')"

    if [ "$full_name" = "package.xml" ]; then
      continue
    fi

    local basename repo_path severity ann
    basename="$(basename "$file_name")"
    repo_path="$(_repo_path_for_basename "$basename")"

    if [ "$problem_type" = "Error" ]; then
      severity="CRITICAL"
    else
      severity="MEDIUM"
    fi

    idx=$((idx + 1))
    ann="$(jq -n \
      --arg external_id "ccc-validation-comp-${idx}" \
      --arg annotation_type "BUG" \
      --arg component_type "$component_type" \
      --arg full_name "$full_name" \
      --arg problem "$problem" \
      --arg severity "$severity" \
      --argjson line "$line_number" \
      --arg path "$repo_path" \
      '{
        external_id: $external_id,
        annotation_type: $annotation_type,
        summary: (($component_type + " " + $full_name + ": " + $problem) | .[0:450]),
        severity: $severity,
        line: $line
      }
      + (if $path != "" then {path: $path} else {} end)'
    )"
    annotations="$(echo "$annotations" | jq --argjson ann "$ann" '. + [$ann]')"
  done < <(echo "$deploy_json" | jq -c '
    (.result.details.componentFailures // empty)
    | if . == null then empty
      elif type == "array" then .[]
      else .
      end
  ')

  echo "$annotations"
}

# Emit annotations for Apex test failures. Input: sf project deploy report --json output (string).
test_failure_annotations() {
  local deploy_json="$1"
  local annotations="[]"
  local idx=0
  local failure

  while IFS= read -r failure; do
    [ -z "$failure" ] && continue

    local name method_name message stack_trace line_number basename repo_path ann
    name="$(echo "$failure" | jq -r '.name // ""')"
    method_name="$(echo "$failure" | jq -r '.methodName // ""')"
    message="$(echo "$failure" | jq -r '.message // ""')"
    stack_trace="$(echo "$failure" | jq -r '.stackTrace // ""')"
    line_number="$(echo "$failure" | jq -r '
      (.stackTrace // "")
      | try (capture("line (?<n>[0-9]+)").n | tonumber) catch 0
    ')"
    basename="${name}.cls"
    repo_path="$(_repo_path_for_basename "$basename")"

    idx=$((idx + 1))
    ann="$(jq -n \
      --arg external_id "ccc-validation-test-${idx}" \
      --arg annotation_type "BUG" \
      --arg name "$name" \
      --arg method_name "$method_name" \
      --arg message "$message" \
      --arg stack_trace "$stack_trace" \
      --argjson line "$line_number" \
      --arg path "$repo_path" \
      '{
        external_id: $external_id,
        annotation_type: $annotation_type,
        severity: "HIGH",
        summary: (($name + "." + $method_name + ": " + $message) | .[0:450]),
        details: ($stack_trace | .[0:2000]),
        line: $line
      }
      + (if $path != "" then {path: $path} else {} end)'
    )"
    annotations="$(echo "$annotations" | jq --argjson ann "$ann" '. + [$ann]')"
  done < <(echo "$deploy_json" | jq -c '
    (.result.details.runTestResult.failures // empty)
    | if . == null then empty
      elif type == "array" then .[]
      else .
      end
  ')

  echo "$annotations"
}
