import Generator from "yeoman-generator";
import yosay from "yosay";
import path from "path";
import { EOL } from "os";
import merge from "deepmerge";
import type { ArrayMergeOptions } from "deepmerge";
import { parseStringPromise as parseXml } from "xml2js";
import stripJsonComments from "strip-json-comments";

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PackageXml {
  version?: string;
  namespace?: string;
  types?: Record<string, string[]>;
}

interface XmlPackageType {
  name: string[];
  members: string[];
}

interface ParsedPackageXml {
  Package?: {
    version?: string[];
    $?: { xmlns?: string };
    types?: XmlPackageType[];
  };
}

export default class extends Generator {
  public prompting(): void {
    this.log(yosay("Callaway Cloud SFDX Project"));
  }

  public async writing(): Promise<void> {
    this.fs.copy(this.templatePath(path.join(".", "static")), this.destinationPath("."), {
      globOptions: { dot: true },
    });

    await this.writeManifest();
    this.writeNpmPackage();
    this.writePrettier();
    this.writeVscodeFiles();
    this.writeGitIgnore();
  }

  private async writeManifest(): Promise<void> {
    const manifestPath = this.destinationPath(path.join("manifest", "package.xml"));
    const oldPkgManifest: PackageXml | null = this.fs.exists(manifestPath)
      ? await readPackage(this.fs.read(manifestPath) ?? "")
      : null;

    const defaultPath = this.templatePath(path.join(".", "dynamic", "package.xml"));
    const defaultPkg = await readPackage(this.fs.read(defaultPath) ?? "");

    const newPkgXml = oldPkgManifest ? merge(defaultPkg, oldPkgManifest) : defaultPkg;
    const newPkg = writePackage(newPkgXml);
    this.fs.write(manifestPath, newPkg);
  }

  private writeNpmPackage(): void {
    const filePath = this.destinationPath("package.json");

    const defaultJson: JsonObject = {
      name: path.basename(this.destinationPath(".")),
      scripts: {
        "pretty-quick": "pretty-quick --staged",
        "pretty-all-apex": "npx prettier --write 'src/**/*.{trigger,cls}'",
        clean: "sfdx force:source:clean",
        "pkg-branch": "sfdx git:package -d dist/$(git symbolic-ref --short HEAD)",
      },
      devDependencies: {
        husky: "^7.x",
        prettier: "^2.x",
        "prettier-plugin-apex": "^1.x",
        "pretty-quick": "^3.x",
        "sfdx-cli": "7.106.3",
      },
      husky: {
        hooks: {
          "pre-commit": "./build/format-commit.sh",
        },
      },
    };

    this._private_deepMergeObjectsAndWriteToFile(filePath, defaultJson);
  }

  private writePrettier(): void {
    const filePath = this.destinationPath(".prettierrc");

    const defaultJson: JsonObject = {
      trailingComma: "none",
      printWidth: 120,
      tabWidth: 4,
      apexInsertFinalNewline: false,
      overrides: [
        {
          files: "*.{cmp,page,component}",
          options: {
            parser: "html",
          },
        },
        {
          files: "*.yml",
          options: {
            tabWidth: 2,
          },
        },
        {
          files: "**/lwc/**/*.html",
          options: {
            parser: "lwc",
          },
        },
        {
          files: "*.{cmp,page,component}",
          options: {
            parser: "html",
          },
        },
      ],
    };

    this._private_deepMergeObjectsAndWriteToFile(filePath, defaultJson);
  }

  private writeVscodeFiles(): void {
    this._private_writeVscodeLaunch();
    this._private_writeVscodeSettings();
  }

  private _private_writeVscodeLaunch(): void {
    const filePath = this.destinationPath(path.join(".vscode", "launch.json"));

    const defaultJson: JsonObject = {
      version: "0.2.0",
      configurations: [
        {
          name: "Launch Apex Replay Debugger",
          type: "apex-replay",
          request: "launch",
          logFile: "${command:AskForLogFileName}",
          stopOnEntry: true,
          trace: true,
        },
      ],
    };

    this._private_deepMergeObjectsAndWriteToFile(filePath, defaultJson);
  }

  private _private_writeVscodeSettings(): void {
    const filePath = this.destinationPath(path.join(".vscode", "settings.json"));

    const defaultJson: JsonObject = {
      "salesforcedx-vscode-core.show-cli-success-msg": false,
      "salesforcedx-vscode-core.push-or-deploy-on-save.enabled": true,
      "salesforcedx-vscode-core.detectConflictsAtSync": true,
      "editor.formatOnSave": true,
      "editor.formatOnSaveTimeout": 5000,
      "search.exclude": {
        "**/node_modules": true,
        "**/dist": true,
        "**/*.meta.xml": true,
      },
    };

    this._private_deepMergeObjectsAndWriteToFile(filePath, defaultJson);
  }

  private _private_deepMergeObjectsAndWriteToFile(filePath: string, defaultJson: JsonObject): void {
    const existingJsonString = this.fs.exists(filePath) ? (this.fs.read(filePath) ?? "{}") : "{}";
    const existingJson = JSON.parse(stripJsonComments(existingJsonString)) as JsonObject;

    const mergedJsons = this._private_deepMergeObjects(defaultJson, existingJson);

    if (JSON.stringify(existingJson) !== JSON.stringify(mergedJsons)) {
      this.fs.writeJSON(filePath, mergedJsons);
    }
  }

  private _private_deepMergeObjects(defaultJson: JsonObject, existingJson: JsonObject): JsonObject {
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

  private writeGitIgnore(): void {
    const ignorePath = this.destinationPath(".gitignore");
    const currentIgnore = this.fs.exists(ignorePath) ? (this.fs.read(ignorePath) ?? "") : "";

    const currentIgnoreLines = currentIgnore.split(EOL);
    const defaultIgnores = ["dist/", "node_modules/"];
    const missing: string[] = [];
    for (const defaultIgnore of defaultIgnores) {
      if (!currentIgnoreLines.includes(defaultIgnore)) {
        missing.push(defaultIgnore);
      }
    }

    if (missing.length > 0) {
      this.fs.write(ignorePath, currentIgnore + EOL + missing.join(EOL));
    }
  }

  public install(): void {
    if (this.options.skipInstall) {
      return;
    }

    this.log("Installing sfdx force-source-clean");
    this.spawnCommandSync("sfdx", ["plugins:install", "force-source-clean"]);

    this.log("Installing sfdx sfdx-git-packager");
    this.spawnCommandSync("sfdx", ["plugins:install", "sfdx-git-packager"]);

    this.spawnCommandSync("npm", ["install"]);
  }
}

async function readPackage(xmlStr: string): Promise<PackageXml> {
  const xml = (await parseXml(xmlStr)) as ParsedPackageXml;
  const version = xml.Package?.version?.[0];
  const namespace = xml.Package?.$?.xmlns;
  let types: PackageXml["types"] = {};

  if (xml.Package?.types) {
    try {
      types = xml.Package.types.reduce<Record<string, string[]>>((res, t) => {
        res[t.name[0]] = t.members;
        return res;
      }, {});
    } catch (e) {
      console.log(e);
    }
  }

  return {
    version,
    namespace,
    types,
  };
}

function writePackage(pkg: PackageXml): string {
  let types = "";
  if (pkg.types) {
    for (const key in pkg.types) {
      types += "  <types>\n";
      types +=
        [...new Set<string>(pkg.types[key])].map((m) => `    <members>${m}</members>`).join("\n") +
        "\n";
      types += `    <name>${key}</name>\n`;
      types += "  </types>\n";
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<Package xmlns="${pkg.namespace ?? ""}">
${types}  <version>${pkg.version ?? ""}</version>
</Package>
`;
}
