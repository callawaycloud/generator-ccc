import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deepMergeObjects } from "../src/lib/json-merge.js";
import { appendGitignore } from "../src/lib/files.js";
import {
  mergeManifestFile,
  readPackage,
  writePackage,
  type PackageXml,
} from "../src/lib/manifest.js";
import { createTempDir, cleanupTempDir, countOccurrences, readText } from "./helpers.js";

const DEFAULT_MANIFEST = `<?xml version="1.0" encoding="UTF-8" ?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>*</members>
    <name>ApexClass</name>
  </types>
  <types>
    <members>*</members>
    <name>ApexTrigger</name>
  </types>
  <version>62.0</version>
</Package>
`;

describe("lib", function () {
  describe("deepMergeObjects", function () {
    it("lets existing scalar and nested values win over defaults", function () {
      const defaults = {
        keep: "default",
        nested: { fromDefault: true, shared: "default" },
      };
      const existing = {
        override: "existing",
        nested: { shared: "existing", fromExisting: true },
      };

      const merged = deepMergeObjects(defaults, existing);

      assert.equal(merged.keep, "default");
      assert.equal(merged.override, "existing");
      assert.deepEqual(merged.nested, {
        fromDefault: true,
        shared: "existing",
        fromExisting: true,
      });
    });

    it("combines arrays without duplicating values", function () {
      const defaults = { tags: ["alpha", "beta"], items: ["one", "two"] };
      const existing = { tags: ["beta", "gamma"], items: ["two", "three"] };

      const merged = deepMergeObjects(defaults, existing);

      assert.deepEqual(merged.tags, ["alpha", "beta", "gamma"]);
      assert.deepEqual(merged.items, ["one", "two", "three"]);
    });
  });

  describe("readPackage / writePackage", function () {
    it("round-trips package.xml content", async function () {
      const original: PackageXml = {
        version: "50.0",
        namespace: "http://soap.sforce.com/2006/04/metadata",
        types: {
          ApexClass: ["MyClass"],
          CustomObject: ["Account", "Account"],
        },
      };

      const xml = writePackage(original);
      const parsed = await readPackage(xml);

      assert.equal(parsed.version, "50.0");
      assert.equal(parsed.namespace, "http://soap.sforce.com/2006/04/metadata");
      assert.deepEqual(parsed.types?.ApexClass, ["MyClass"]);
      assert.deepEqual(parsed.types?.CustomObject, ["Account"]);
    });
  });

  describe("mergeManifestFile", function () {
    let tmpDir: string;

    beforeEach(function () {
      tmpDir = createTempDir("ccc-manifest-");
    });

    afterEach(function () {
      cleanupTempDir(tmpDir);
    });

    it("preserves existing members and version while adding default types", async function () {
      const manifestPath = path.join(tmpDir, "manifest", "package.xml");
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      const existingXml = `<?xml version="1.0" encoding="UTF-8" ?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>MyCustomClass</members>
    <name>ApexClass</name>
  </types>
  <version>50.0</version>
</Package>
`;
      fs.writeFileSync(manifestPath, existingXml, "utf-8");

      await mergeManifestFile(manifestPath, DEFAULT_MANIFEST);
      const merged = readText(manifestPath);

      assert.match(merged, /<members>MyCustomClass<\/members>/);
      assert.match(merged, /<name>ApexTrigger<\/name>/);
      assert.match(merged, /<version>50\.0<\/version>/);
    });
  });

  describe("appendGitignore", function () {
    let tmpDir: string;

    beforeEach(function () {
      tmpDir = createTempDir("ccc-gitignore-");
    });

    afterEach(function () {
      cleanupTempDir(tmpDir);
    });

    it("appends missing default entries", function () {
      const result = appendGitignore(tmpDir, ["dist/", "node_modules/"]);

      assert.equal(result, "created");
      const contents = readText(path.join(tmpDir, ".gitignore"));
      assert.match(contents, /dist\//);
      assert.match(contents, /node_modules\//);
    });

    it("does not duplicate entries that already exist", function () {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "dist/\nnode_modules/\n", "utf-8");

      const result = appendGitignore(tmpDir, ["dist/", "node_modules/"]);

      assert.equal(result, "skipped");
      const contents = readText(path.join(tmpDir, ".gitignore"));
      assert.equal(countOccurrences(contents, "dist/"), 1);
      assert.equal(countOccurrences(contents, "node_modules/"), 1);
    });
  });
});
