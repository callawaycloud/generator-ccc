import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { JsonObject } from "../src/lib/json-merge.js";

/**
 * Creates a temporary directory for isolated scaffold tests.
 */
export function createTempDir(prefix = "ccc-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Removes a temporary directory and its contents.
 */
export function cleanupTempDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Returns true when a file exists at the given path.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Returns true when a value is a plain JSON object.
 */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a JSON file and returns a typed JsonObject.
 */
export function readJsonObject(filePath: string): JsonObject {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected JSON object at ${filePath}`);
  }
  return parsed;
}

/**
 * Reads a text file from the given path.
 */
export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Counts non-overlapping occurrences of a substring in text.
 */
export function countOccurrences(text: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return text.split(needle).length - 1;
}
