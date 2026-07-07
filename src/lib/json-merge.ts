import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import merge from "deepmerge";
import type { ArrayMergeOptions } from "deepmerge";
import stripJsonComments from "strip-json-comments";

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Returns true when the value is a plain JSON object (not null or array).
 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges default JSON into existing JSON; existing values win on conflicts.
 * Arrays are combined via index-aware merge with deduplication.
 */
export function deepMergeObjects(defaultJson: JsonObject, existingJson: JsonObject): JsonObject {
  const combineMerge = (
    target: JsonValue[],
    source: JsonValue[],
    options: ArrayMergeOptions
  ): JsonValue[] => {
    const destination = target.slice();

    source.forEach((item, index) => {
      if (typeof destination[index] === "undefined") {
        destination[index] = isJsonObject(item)
          ? (options.cloneUnlessOtherwiseSpecified(item, options) as JsonValue)
          : item;
      } else if (isJsonObject(item) && isJsonObject(target[index])) {
        destination[index] = merge(target[index], item, options);
      } else if (target.indexOf(item) === -1) {
        destination.push(item);
      }
    });
    return destination;
  };

  return merge(defaultJson, existingJson, { arrayMerge: combineMerge });
}

/**
 * Parses a JSON string (with optional comments) into a JsonObject.
 */
export function parseJsonContent(content: string): JsonObject {
  const stripped = stripJsonComments(content);
  const parsed: unknown = JSON.parse(stripped);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("JSON content must be an object");
  }
  return parsed as JsonObject;
}

export type JsonMergeResult = "created" | "merged" | "skipped";

/**
 * Reads an existing JSON file (or treats missing file as empty), deep-merges with defaults,
 * and writes only when the merged result differs from what is on disk.
 */
export function mergeJsonFile(
  filePath: string,
  defaultJson: JsonObject
): JsonMergeResult {
  const fileExists = existsSync(filePath);
  const existingContent = fileExists ? readFileSync(filePath, "utf-8") : "{}";
  const existingJson = parseJsonContent(existingContent);
  const mergedJson = deepMergeObjects(defaultJson, existingJson);

  if (JSON.stringify(existingJson) === JSON.stringify(mergedJson)) {
    return "skipped";
  }

  const parentDir = path.dirname(filePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeFileSync(filePath, `${JSON.stringify(mergedJson, null, 2)}\n`, "utf-8");
  return fileExists ? "merged" : "created";
}

/**
 * Computes the merged JSON without writing; returns null when no change would occur.
 */
export function previewJsonMerge(
  filePath: string,
  defaultJson: JsonObject
): JsonObject | null {
  const fileExists = existsSync(filePath);
  const existingContent = fileExists ? readFileSync(filePath, "utf-8") : "{}";
  const existingJson = parseJsonContent(existingContent);
  const mergedJson = deepMergeObjects(defaultJson, existingJson);

  if (JSON.stringify(existingJson) === JSON.stringify(mergedJson)) {
    return null;
  }

  return mergedJson;
}
