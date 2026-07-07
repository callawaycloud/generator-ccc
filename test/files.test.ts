import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectContext } from "../src/lib/context.js";
import { scaffoldProject } from "../src/commands/init.js";
import { copyStaticTemplates, previewStaticTemplateChanges } from "../src/lib/files.js";
import { cleanupTempDir, createTempDir, readText } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const STATIC_TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "static");
const DEFAULT_BRANCH = "main";
const PIPELINE_RELATIVE_PATH = "bitbucket-pipelines.yml";
const MODIFIED_PIPELINE_CONTENT = "# modified pipeline content\n";

describe("static template overwrite", function () {
  this.timeout(10000);

  let tmpDir: string;

  beforeEach(function () {
    tmpDir = createTempDir("ccc-files-overwrite-");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, PIPELINE_RELATIVE_PATH), MODIFIED_PIPELINE_CONTENT, "utf-8");
  });

  afterEach(function () {
    cleanupTempDir(tmpDir);
  });

  it("does not overwrite an existing modified non-JSON file by default", async function () {
    const ctx = createProjectContext(tmpDir, DEFAULT_BRANCH);
    await scaffoldProject(ctx);

    assert.equal(readText(path.join(tmpDir, PIPELINE_RELATIVE_PATH)), MODIFIED_PIPELINE_CONTENT);
  });

  it("overwrites an existing modified non-JSON file when overwriteStatic is true", async function () {
    const ctx = createProjectContext(tmpDir, DEFAULT_BRANCH);
    await scaffoldProject(ctx, { overwriteStatic: true });

    const updated = readText(path.join(tmpDir, PIPELINE_RELATIVE_PATH));
    const template = readText(path.join(STATIC_TEMPLATE_DIR, PIPELINE_RELATIVE_PATH)).replaceAll(
      "{{defaultBranch}}",
      DEFAULT_BRANCH
    );

    assert.equal(updated, template);
    assert.notEqual(updated, MODIFIED_PIPELINE_CONTENT);
  });

  it("does not list an existing modified non-JSON file in preview without overwriteStatic", function () {
    const changes = previewStaticTemplateChanges({
      templateDir: STATIC_TEMPLATE_DIR,
      destRoot: tmpDir,
      defaultBranch: DEFAULT_BRANCH,
    });

    assert.equal(changes.includes(PIPELINE_RELATIVE_PATH), false);
  });

  it("lists an existing modified non-JSON file in preview with overwriteStatic", function () {
    const changes = previewStaticTemplateChanges({
      templateDir: STATIC_TEMPLATE_DIR,
      destRoot: tmpDir,
      defaultBranch: DEFAULT_BRANCH,
      overwriteStatic: true,
    });

    assert.equal(changes.includes(PIPELINE_RELATIVE_PATH), true);
  });

  it("records skipped when overwriteStatic content is identical", function () {
    const templateContent = readText(
      path.join(STATIC_TEMPLATE_DIR, PIPELINE_RELATIVE_PATH)
    ).replaceAll("{{defaultBranch}}", DEFAULT_BRANCH);
    fs.writeFileSync(path.join(tmpDir, PIPELINE_RELATIVE_PATH), templateContent, "utf-8");

    const summary = copyStaticTemplates({
      templateDir: STATIC_TEMPLATE_DIR,
      destRoot: tmpDir,
      defaultBranch: DEFAULT_BRANCH,
      overwriteStatic: true,
    });

    assert.equal(summary.skipped.includes(PIPELINE_RELATIVE_PATH), true);
    assert.equal(summary.merged.includes(PIPELINE_RELATIVE_PATH), false);
  });
});
