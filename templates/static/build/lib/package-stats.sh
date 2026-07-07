#!/bin/bash
# Sourced library — do not execute directly. Caller must not rely on errexit here.

package_stats() {
  local package_file="${1:-}"
  if [ ! -f "$package_file" ]; then
    return 0
  fi

  awk '
    BEGIN { in_types = 0; members = 0; type = "" }
    /<types>/ { in_types = 1; members = 0; type = "" }
    in_types && /<members>/ { members++ }
    in_types && /<name>/ {
      line = $0
      sub(/.*<name>/, "", line)
      sub(/<\/name>.*/, "", line)
      type = line
    }
    /<\/types>/ {
      if (in_types && type != "") {
        print type "\t" members
      }
      in_types = 0
    }
  ' "$package_file"
}

package_total() {
  local package_file="${1:-}"
  local total=0
  local count

  if [ ! -f "$package_file" ]; then
    echo "0"
    return 0
  fi

  while IFS=$'\t' read -r _type count; do
    total=$((total + count))
  done < <(package_stats "$package_file")

  echo "$total"
}

_friendly_type_label() {
  local api_name="$1"
  case "$api_name" in
    Flow) echo "Flow(s)" ;;
    ApexClass) echo "Apex Class(es)" ;;
    ApexTrigger) echo "Apex Trigger(s)" ;;
    CustomObject) echo "Custom Object(s)" ;;
    CustomField) echo "Field(s)" ;;
    Layout) echo "Page Layout(s)" ;;
    PermissionSet) echo "Permission Set(s)" ;;
    ValidationRule) echo "Validation Rule(s)" ;;
    CustomMetadata) echo "Custom Metadata Record(s)" ;;
    LightningComponentBundle) echo "Lightning Web Component(s)" ;;
    AuraDefinitionBundle) echo "Aura Component(s)" ;;
    StaticResource) echo "Static Resource(s)" ;;
    CustomLabel|CustomLabels) echo "Custom Label(s)" ;;
    FlexiPage) echo "Lightning Page(s)" ;;
    Workflow) echo "Workflow Rule(s)" ;;
    *) echo "" ;;
  esac
}

_format_friendly_entry() {
  local template="$1"
  local count="$2"
  local label

  if [ "$count" -eq 1 ]; then
    label="$(echo "$template" | sed -e 's/(es)//g' -e 's/(s)//g')"
  else
    label="$(echo "$template" | sed -e 's/(es)/es/g' -e 's/(s)/s/g')"
  fi

  echo "${count} ${label}"
}

friendly_summary() {
  local package_file="${1:-}"
  local entries=()
  local api_name
  local count
  local template
  local entry

  if [ ! -f "$package_file" ]; then
    echo "no components"
    return 0
  fi

  while IFS=$'\t' read -r api_name count; do
    if [ "${count:-0}" -eq 0 ]; then
      continue
    fi

    template="$(_friendly_type_label "$api_name")"
    if [ -n "$template" ]; then
      entry="$(_format_friendly_entry "$template" "$count")"
    else
      entry="${count} ${api_name}"
    fi
    entries+=("$entry")
  done < <(package_stats "$package_file")

  if [ "${#entries[@]}" -eq 0 ]; then
    echo "no components"
    return 0
  fi

  local summary=""
  for entry in "${entries[@]}"; do
    if [ -n "$summary" ]; then
      summary="${summary}, ${entry}"
    else
      summary="$entry"
    fi
  done
  echo "$summary"
}
