import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import assert from "yeoman-assert";
import helpers from "yeoman-test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const generatorPath = path.join(__dirname, "../generators/app");
const fixturePath = path.join(__dirname, "fixtures/existing-project");

/**
 * Run the generator against a copy of the existing-project fixture.
 * @returns {Promise<void>}
 */
function runGeneratorOnFixture() {
    return helpers
        .run(generatorPath)
        .inTmpDir(function (dir) {
            fs.cpSync(fixturePath, dir, { recursive: true });
        })
        .withOptions({ skipInstall: true });
}

describe("generator-ccc:app", function () {
    this.timeout(10000);

    describe("fresh project", function () {
        before(async function () {
            await helpers
                .run(generatorPath)
                .withOptions({ skipInstall: true });
        });

        it("creates static template files", function () {
            assert.file([
                "bitbucket-pipelines.yml",
                "build/setup.sh",
                "build/sync.sh",
                "build/package.sh",
                "build/merge.sh",
                "build/format-commit.sh",
                "build/schedule.sh",
                "build/pipelines-setup.md",
                "build/known-metadata-issues.md",
            ]);
        });

        it("creates merged config files", function () {
            assert.file([
                "manifest/package.xml",
                "package.json",
                ".prettierrc",
                ".vscode/launch.json",
                ".vscode/settings.json",
            ]);
        });

        it("writes default package.json scripts and devDependencies", function () {
            assert.fileContent("package.json", /"pretty-quick"/);
            assert.fileContent("package.json", /"sfdx force:source:clean"/);
            assert.fileContent("package.json", /"sfdx-cli"/);
            assert.fileContent("package.json", /"pre-commit": "\.\/build\/format-commit\.sh"/);
        });

        it("writes default manifest metadata types", function () {
            assert.fileContent("manifest/package.xml", /<name>ApexClass<\/name>/);
            assert.fileContent("manifest/package.xml", /<name>LightningComponentBundle<\/name>/);
            assert.fileContent("manifest/package.xml", /<version>60\.0<\/version>/);
        });

        it("appends default gitignore entries", function () {
            assert.fileContent(".gitignore", /dist\//);
            assert.fileContent(".gitignore", /node_modules\//);
        });

        it("writes default vscode settings", function () {
            assert.fileContent(
                ".vscode/settings.json",
                /"editor\.formatOnSave": true/
            );
            assert.fileContent(
                ".vscode/settings.json",
                /"salesforcedx-vscode-core\.detectConflictsAtSync": true/
            );
        });
    });

    describe("existing project merge", function () {
        before(async function () {
            await runGeneratorOnFixture();
        });

        it("preserves existing package.json identity and custom scripts", function () {
            assert.jsonFileContent("package.json", {
                name: "my-sfdx-project",
                version: "2.0.0",
            });
            assert.fileContent("package.json", /"test": "npm run lint"/);
            assert.fileContent("package.json", /"pretty-quick"/);
        });

        it("merges manifest types and preserves existing members", function () {
            assert.fileContent("manifest/package.xml", /<members>MyCustomClass<\/members>/);
            assert.fileContent("manifest/package.xml", /<members>CustomObject__c<\/members>/);
            assert.fileContent("manifest/package.xml", /<name>ApexTrigger<\/name>/);
            assert.fileContent("manifest/package.xml", /<version>50\.0<\/version>/);
        });

        it("preserves existing prettier settings while adding defaults", function () {
            assert.jsonFileContent(".prettierrc", {
                tabWidth: 2,
                singleQuote: true,
            });
            assert.fileContent(".prettierrc", /"printWidth": 120/);
            assert.fileContent(".prettierrc", /"trailingComma": "none"/);
        });

        it("preserves existing vscode settings while adding defaults", function () {
            assert.jsonFileContent(".vscode/settings.json", {
                "editor.tabSize": 2,
                "my.custom.setting": true,
            });
            assert.fileContent(
                ".vscode/settings.json",
                /"editor\.formatOnSave": true/
            );
        });

        it("appends missing gitignore entries without removing existing lines", function () {
            assert.fileContent(".gitignore", /\*\.log/);
            assert.fileContent(".gitignore", /dist\//);
            assert.fileContent(".gitignore", /node_modules\//);
        });
    });

    describe("existing gitignore", function () {
        it("does not duplicate gitignore entries when defaults already exist", async function () {
            await helpers
                .run(generatorPath)
                .inTmpDir(function (dir) {
                    fs.writeFileSync(
                        path.join(dir, ".gitignore"),
                        "dist/\nnode_modules/\n"
                    );
                })
                .withOptions({ skipInstall: true });

            const contents = fs.readFileSync(".gitignore", "utf8");
            const distCount = contents.split("dist/").length - 1;
            const nodeModulesCount =
                contents.split("node_modules/").length - 1;

            assert.strictEqual(distCount, 1);
            assert.strictEqual(nodeModulesCount, 1);
        });
    });
});
