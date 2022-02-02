import Generator from "yeoman-generator";
import yosay from "yosay";
import path from "path";
import { EOL } from "os";
import merge from "deepmerge";
import updateNotifier from "update-notifier";
import pkg from "../../package.json";
import { parseStringPromise as parseXml } from "xml2js";
import stripJsonComments from "strip-json-comments";

module.exports = class extends Generator {
  private props: {};

  constructor(args, opts) {
    super(args, opts);
  }

  public prompting() {
    // Have Yeoman greet the user.
    this.log(yosay(`Callaway Cloud SFDX Project`));

    const notifier = updateNotifier({ pkg });
    notifier.notify();

    const prompts = [];

    return this.prompt(prompts).then((props) => {
      // To access props later use this.props.someAnswer;
      this.props = props;
    });
  }

  public async writing() {
    this.fs.copy(
      this.templatePath(path.join(".", "static")),
      this.destinationPath("."),
      { globOptions: { dot: true } }
    );

    await this.writeManifest();
    this.writeNpmPackage();
    this.writePrettier();
    this.writeVscodeFiles();
    this.writeGitIgnore();
  }

  private async writeManifest() {
    const manifestPath = this.destinationPath(
      path.join("manifest", "package.xml")
    );
    const oldPkgManifest: any = this.fs.exists(manifestPath)
      ? await readPackage(this.fs.read(manifestPath))
      : null;

    const defaultPath = this.templatePath(
      path.join(".", "dynamic", "package.xml")
    );
    let defaultPkg = await readPackage(this.fs.read(defaultPath));

    let newPkgXml = oldPkgManifest
      ? merge(defaultPkg, oldPkgManifest)
      : defaultPkg;
    const newPkg = writePackage(newPkgXml);
    this.fs.write(manifestPath, newPkg);
  }

  private writeNpmPackage() {
    const filePath = this.destinationPath("package.json");

    // Extend or create package.json file in destination path
    const npmPackagePath = this.destinationPath("package.json");
    const oldPkgJson = this.fs.exists(npmPackagePath)
      ? this.fs.readJSON(npmPackagePath)
      : {};

    // if there are key conflicts the rightmost (pkgJson) wins
    let defaultJson = {
      name: oldPkgJson.name
        ? oldPkgJson.name
        : path.basename(this.destinationPath(".")),
      scripts: {
        "pretty-quick": "pretty-quick --staged",
        "pretty-all-apex": "npx prettier --write 'src/**/*.{trigger,cls}'",
        clean: "sfdx force:source:clean",
        "pkg-branch":
          "sfdx git:package -d dist/$(git symbolic-ref --short HEAD)",
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

    const newPkgJson = merge(oldPkgJson, defaultJson);
    this.fs.write(npmPackagePath, JSON.stringify(newPkgJson, null, 4));

    this._private_deepMergeObjectsAndWriteToFile(filePath, defaultJson);
  }

  private writePrettier() {
    const filePath = this.destinationPath(".prettierrc");

    const defaultJson = {
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

  /**
   * .vscode files below
   */

  private writeVscodeFiles() {
    this._private_writeVscodeLaunch();
    this._private_writeVscodeSettings();
  }

  private _private_writeVscodeLaunch() {
    const filePath = this.destinationPath(path.join(".vscode", "launch.json"));

    const defaultJson = {
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

  private _private_writeVscodeSettings() {
    const filePath = this.destinationPath(
      path.join(".vscode", "settings.json")
    );

    const defaultJson = {
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

  /**
   * Merge two JSONs together and write them to a file
   * @param filePath The path to the file from the root directory of the project
   * @param defaultJson The base JSON used in the event one does not exist yet
   */

  private _private_deepMergeObjectsAndWriteToFile(filePath, defaultJson): void {
    // Comments in JSON will break fs.readJSON, as well as JSON.parse, so we strip them out
    const existingJsonString = this.fs.exists(filePath)
      ? this.fs.read(filePath)
      : "{}";
    const existingJson = JSON.parse(stripJsonComments(existingJsonString));

    // console.log('filePath', filePath);
    // console.log('existingJson');
    // console.log(existingJson);

    const mergedJsons = this._private_deepMergeObjects(
      defaultJson,
      existingJson
    );

    // console.log('mergedJsons');
    // console.log(mergedJsons);
    // console.log('\n\n');

    // Strip all whitespace to see if we need to write any changes
    if (JSON.stringify(existingJson) !== JSON.stringify(mergedJsons)) {
      this.fs.writeJSON(filePath, mergedJsons);
    }
  }

  /**
   * Merge two JSONs.
   * This takes the user's existing JSON from file path and overwrites the default.
   * @param filePath The path to the file from the root directory of the project
   * @param defaultJson The base JSON used in the event one does not exist yet
   * @param defaultJson The JSON that already exists on the user's system
   * @returns Object of the merged JSONs
   */

  private _private_deepMergeObjects(defaultJson, existingJson): object {
    // deep merge... don't override user settings (Combines objects at the same index in the two arrays.)
    const combineMerge = (target, source, options) => {
      const destination = target.slice();

      source.forEach((item, index) => {
        if (typeof destination[index] === "undefined") {
          destination[index] = options.cloneUnlessOtherwiseSpecified(
            item,
            options
          );
        } else if (options.isMergeableObject(item)) {
          destination[index] = merge(target[index], item, options);
        } else if (target.indexOf(item) === -1) {
          destination.push(item);
        }
      });
      return destination;
    };

    return merge(defaultJson, existingJson, { arrayMerge: combineMerge });
  }

  private writeGitIgnore() {
    const ignorePath = this.destinationPath(".gitignore");
    const currentIgnore = this.fs.exists(ignorePath)
      ? this.fs.read(ignorePath)
      : "";

    const currentIgnoreLines = currentIgnore.split(EOL);
    const defaultIgnores = ["dist/", "node_modules/"];
    const missing = [];
    for (const defaultIgnore of defaultIgnores) {
      if (!currentIgnoreLines.includes(defaultIgnore)) {
        missing.push(defaultIgnore);
      }
    }

    if (missing.length > 0) {
      this.fs.write(ignorePath, currentIgnore + EOL + missing.join(EOL));
    }
  }

  public install() {
    /**
     * Install dependent sfdx plugins
     */

    this.log("Installing sfdx force-source-clean");
    this.spawnCommandSync("sfdx", ["plugins:install", "force-source-clean"]);

    this.log("Installing sfdx sfdx-git-packager");
    this.spawnCommandSync("sfdx", ["plugins:install", "sfdx-git-packager"]);

    // npm install
    this.installDependencies({
      bower: false,
      npm: true,
    });
  }

  end() {}
};

// HELPER (move to new file)

interface PackageXml {
  version?: string;
  namespace?: string;
  types?: { [type: string]: string[] };
}

async function readPackage(xmlStr: string): Promise<PackageXml> {
  let xml = await parseXml(xmlStr);
  let version = xml?.Package?.version?.[0];
  let namespace = xml?.Package?.$?.xmlns;
  let types: { [type: string]: string[] };
  if (xml.Package?.types) {
    try {
      types = xml.Package.types.reduce((res, t) => {
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
  for (let key in pkg.types) {
    types += `  <types>\n`;
    types +=
      [...new Set<string>(pkg.types[key])]
        .map((m) => `    <members>${m}</members>`)
        .join("\n") + "\n";
    types += `    <name>${key}</name>\n`;
    types += `  </types>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<Package xmlns="${pkg.namespace}">
${types}  <version>${pkg.version}</version>
</Package>
`;
}
