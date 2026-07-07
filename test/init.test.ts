import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectContext } from "../src/lib/context.js";
import { scaffoldProject } from "../src/commands/init.js";
import {
  cleanupTempDir,
  countOccurrences,
  createTempDir,
  fileExists,
  readJsonObject,
  readText,
} from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const FIXTURE_PATH = path.join(PACKAGE_ROOT, "test", "fixtures", "existing-project");
const STATIC_TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "static");
const DEFAULT_BRANCH = "main";

const BUILD_SCRIPTS = [
  "build/setup.sh",
  "build/sync.sh",
  "build/package.sh",
  "build/merge.sh",
  "build/format-commit.sh",
  "build/schedule.sh",
] as const;

const PR_VISIBILITY_SCRIPTS = [
  "build/insights.sh",
  "build/lib/annotations.sh",
  "build/lib/package-stats.sh",
] as const;

const EXECUTABLE_PR_VISIBILITY_SCRIPTS = ["build/insights.sh"] as const;

/**
 * Copies the existing-project fixture into a temporary directory.
 */
function seedExistingProjectFixture(destRoot: string): void {
  fs.cpSync(FIXTURE_PATH, destRoot, { recursive: true });
}

/**
 * Lists relative file paths under a template directory.
 */
function listTemplateFiles(templateDir: string, relativeDir = ""): string[] {
  if (!fs.existsSync(templateDir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(templateDir)) {
    const absolutePath = path.join(templateDir, entry);
    const relativePath = path.join(relativeDir, entry);
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...listTemplateFiles(absolutePath, relativePath));
      continue;
    }
    if (entry === ".gitkeep") {
      continue;
    }
    files.push(relativePath);
  }
  return files;
}

/**
 * Returns relative paths for .cursor/rules template files.
 */
function listCursorRuleTemplates(): string[] {
  const rulesDir = path.join(STATIC_TEMPLATE_DIR, ".cursor", "rules");
  return listTemplateFiles(rulesDir).map((file) => path.join(".cursor", "rules", file));
}

/**
 * Returns relative paths for .cursor/skills template files.
 */
function listCursorSkillTemplates(): string[] {
  const skillsDir = path.join(STATIC_TEMPLATE_DIR, ".cursor", "skills");
  return listTemplateFiles(skillsDir).map((file) => path.join(".cursor", "skills", file));
}

describe("scaffoldProject", function () {
  this.timeout(10000);

  describe("fresh project", function () {
    let tmpDir: string;

    before(async function () {
      tmpDir = createTempDir("ccc-init-fresh-");
      const ctx = createProjectContext(tmpDir, DEFAULT_BRANCH);
      await scaffoldProject(ctx);
    });

    after(function () {
      cleanupTempDir(tmpDir);
    });

    it("creates pipeline and build shell scripts", function () {
      assert.ok(fileExists(path.join(tmpDir, "bitbucket-pipelines.yml")));
      for (const script of BUILD_SCRIPTS) {
        assert.ok(fileExists(path.join(tmpDir, script)), `expected ${script}`);
      }
      for (const script of PR_VISIBILITY_SCRIPTS) {
        assert.ok(fileExists(path.join(tmpDir, script)), `expected ${script}`);
      }
    });

    it("creates merged config files", function () {
      const expectedFiles = [
        "manifest/package.xml",
        "package.json",
        ".prettierrc",
        ".vscode/settings.json",
        ".vscode/launch.json",
        ".husky/pre-commit",
      ];

      for (const relativePath of expectedFiles) {
        assert.ok(fileExists(path.join(tmpDir, relativePath)), `expected ${relativePath}`);
      }
    });

    it("creates vscode tasks and extensions when static templates exist", function () {
      const optionalVscodeFiles = [".vscode/tasks.json", ".vscode/extensions.json"];
      for (const relativePath of optionalVscodeFiles) {
        const templatePath = path.join(STATIC_TEMPLATE_DIR, relativePath);
        if (!fileExists(templatePath)) {
          this.skip();
          return;
        }
        assert.ok(fileExists(path.join(tmpDir, relativePath)), `expected ${relativePath}`);
      }
    });

    it("copies static .cursor rule templates", function () {
      const ruleTemplates = listCursorRuleTemplates();
      assert.ok(ruleTemplates.length > 0, "expected at least one .cursor/rules template");
      for (const relativePath of ruleTemplates) {
        assert.ok(fileExists(path.join(tmpDir, relativePath)), `expected ${relativePath}`);
      }
    });

    it("copies static .cursor skill templates", function () {
      const skillTemplates = listCursorSkillTemplates();
      assert.ok(skillTemplates.length > 0, "expected at least one .cursor/skills template");
      for (const relativePath of skillTemplates) {
        assert.ok(fileExists(path.join(tmpDir, relativePath)), `expected ${relativePath}`);
      }
    });

    it("substitutes defaultBranch placeholders in pipeline and build scripts", function () {
      const filesWithBranchPlaceholder = [
        "bitbucket-pipelines.yml",
        "build/format-commit.sh",
        "build/merge.sh",
        "build/package.sh",
        "build/sync.sh",
      ];
      const allTemplatedFiles = [
        "bitbucket-pipelines.yml",
        ...BUILD_SCRIPTS,
        ...PR_VISIBILITY_SCRIPTS,
      ];

      for (const relativePath of allTemplatedFiles) {
        const contents = readText(path.join(tmpDir, relativePath));
        assert.equal(
          contents.includes("{{defaultBranch}}"),
          false,
          `${relativePath} still contains {{defaultBranch}}`
        );
      }

      for (const relativePath of filesWithBranchPlaceholder) {
        const contents = readText(path.join(tmpDir, relativePath));
        assert.match(contents, new RegExp(DEFAULT_BRANCH));
      }
    });

    it("marks build shell scripts as executable", function () {
      for (const script of BUILD_SCRIPTS) {
        const mode = fs.statSync(path.join(tmpDir, script)).mode;
        assert.notEqual(mode & 0o111, 0, `${script} is not executable`);
      }
      for (const script of EXECUTABLE_PR_VISIBILITY_SCRIPTS) {
        const mode = fs.statSync(path.join(tmpDir, script)).mode;
        assert.notEqual(mode & 0o111, 0, `${script} is not executable`);
      }
    });

    it("writes modern package.json devDependencies without sfdx-cli", function () {
      const pkg = readJsonObject(path.join(tmpDir, "package.json"));
      const devDependencies = pkg.devDependencies;
      assert.equal(typeof devDependencies, "object");
      assert.ok(devDependencies !== null && !Array.isArray(devDependencies));

      const deps = devDependencies as Record<string, string>;
      assert.match(deps.prettier ?? "", /\^3/);
      assert.match(deps.husky ?? "", /\^9/);
      assert.equal(JSON.stringify(pkg).includes("sfdx-cli"), false);
      assert.match(JSON.stringify(pkg), /pretty-quick/);
    });

    it("writes default manifest metadata types", function () {
      const manifest = readText(path.join(tmpDir, "manifest", "package.xml"));
      assert.match(manifest, /<name>ApexClass<\/name>/);
      assert.match(manifest, /<name>LightningComponentBundle<\/name>/);
      assert.match(manifest, /<version>62\.0<\/version>/);
    });

    it("appends default gitignore entries", function () {
      const gitignore = readText(path.join(tmpDir, ".gitignore"));
      assert.match(gitignore, /dist\//);
      assert.match(gitignore, /node_modules\//);
    });

    it("writes default vscode settings", function () {
      const settings = readText(path.join(tmpDir, ".vscode", "settings.json"));
      assert.match(settings, /"editor\.formatOnSave": true/);
      assert.match(settings, /"salesforcedx-vscode-core\.detectConflictsAtSync": true/);
    });
  });

  describe("existing project merge", function () {
    let tmpDir: string;

    before(async function () {
      tmpDir = createTempDir("ccc-init-existing-");
      seedExistingProjectFixture(tmpDir);
      const ctx = createProjectContext(tmpDir, DEFAULT_BRANCH);
      await scaffoldProject(ctx);
    });

    after(function () {
      cleanupTempDir(tmpDir);
    });

    it("preserves existing package.json identity and custom scripts", function () {
      const pkg = readJsonObject(path.join(tmpDir, "package.json"));
      assert.equal(pkg.name, "my-sfdx-project");
      assert.equal(pkg.version, "2.0.0");
      const scripts = pkg.scripts;
      assert.equal(typeof scripts, "object");
      assert.ok(scripts !== null && !Array.isArray(scripts));
      assert.equal((scripts as Record<string, string>).test, "npm run lint");
      assert.match(JSON.stringify(pkg), /pretty-quick/);
    });

    it("merges manifest types and preserves existing members", function () {
      const manifest = readText(path.join(tmpDir, "manifest", "package.xml"));
      assert.match(manifest, /<members>MyCustomClass<\/members>/);
      assert.match(manifest, /<members>CustomObject__c<\/members>/);
      assert.match(manifest, /<name>ApexTrigger<\/name>/);
      assert.match(manifest, /<version>50\.0<\/version>/);
    });

    it("preserves existing prettier settings while adding defaults", function () {
      const prettier = readJsonObject(path.join(tmpDir, ".prettierrc"));
      assert.equal(prettier.tabWidth, 2);
      assert.equal(prettier.singleQuote, true);
      assert.equal(prettier.printWidth, 120);
      assert.equal(prettier.trailingComma, "none");
    });

    it("preserves existing vscode settings while adding defaults", function () {
      const settings = readJsonObject(path.join(tmpDir, ".vscode", "settings.json"));
      assert.equal(settings["editor.tabSize"], 2);
      assert.equal(settings["my.custom.setting"], true);
      assert.equal(settings["editor.formatOnSave"], true);
    });

    it("appends missing gitignore entries without removing existing lines", function () {
      const gitignore = readText(path.join(tmpDir, ".gitignore"));
      assert.match(gitignore, /\*\.log/);
      assert.match(gitignore, /dist\//);
      assert.match(gitignore, /node_modules\//);
      assert.equal(countOccurrences(gitignore, "dist/"), 1);
      assert.equal(countOccurrences(gitignore, "node_modules/"), 1);
    });
  });

  describe("existing gitignore", function () {
    let tmpDir: string;

    before(async function () {
      tmpDir = createTempDir("ccc-init-gitignore-");
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "dist/\nnode_modules/\n", "utf-8");
      const ctx = createProjectContext(tmpDir, DEFAULT_BRANCH);
      await scaffoldProject(ctx);
    });

    after(function () {
      cleanupTempDir(tmpDir);
    });

    it("does not duplicate gitignore entries when defaults already exist", function () {
      const contents = readText(path.join(tmpDir, ".gitignore"));
      assert.equal(countOccurrences(contents, "dist/"), 1);
      assert.equal(countOccurrences(contents, "node_modules/"), 1);
    });
  });
});
