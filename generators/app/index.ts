import Generator from "yeoman-generator";
import yosay from "yosay";
import path from "path";
import {EOL} from 'os';
import merge from "deepmerge";

module.exports = class extends Generator {
  private props: {};

  constructor(args, opts) {
    super(args, opts);
  }

  public prompting() {
    // Have Yeoman greet the user.
    this.log(yosay(`Callaway Cloud SFDX Project`));

    const prompts = [];

    return this.prompt(prompts).then(props => {
      // To access props later use this.props.someAnswer;
      this.props = props;
    });
  }

  public writing() {
    this.fs.copy(
      this.templatePath(path.join(".", "static")),
      this.destinationPath("."),
      { globOptions: { dot: true } }
    );

    this.writeNpmPackage();
    this.writePrettier();
    this.writeVscodeSettings();
    this.writeGitIgnore();
  }

  private writeNpmPackage() {
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
        "pretty-all-apex": "npx prettier --write 'src/**/*.{trigger,cls}'",
        clean: "sfdx force:source:clean",
        "pkg-branch":
          "sfdx git:package -d dist/$(git symbolic-ref --short HEAD)"
      },
      devDependencies: {
        husky: "^3.0.9",
        prettier: "1.19.1",
        "prettier-plugin-apex": "^1.0.0",
        "pretty-quick": "^2.0.1"
      },
      husky: {
        hooks: {
          "pre-commit": "pretty-quick --staged"
        }
      }
    };

    const newPkgJson = merge(oldPkgJson, defaultJson);
    this.fs.write(npmPackagePath, JSON.stringify(newPkgJson, null, 2));
  }

  private writePrettier() {
    //prettier
    const prettierSettings = {
      trailingComma: "none",
      printWidth: 120,
      tabWidth: 4,
      apexInsertFinalNewline: false,
      overrides: [
        {
          files: "*.{cmp,page,component}",
          options: { parser: "html" }
        },
        {
          files: "*.yml",
          options: { tabWidth: 2 }
        }
      ]
    };

    // Extend or create package.json file in destination path
    this.fs.extendJSON(this.destinationPath(".prettierrc"), prettierSettings);
  }

  private writeVscodeSettings() {
    const vscodeSettingsPath = this.destinationPath(
      path.join(".vscode", "settings.json")
    );
    const oldSettings = this.fs.exists(vscodeSettingsPath)
      ? this.fs.readJSON(vscodeSettingsPath)
      : {};

    //prettier
    const defaultSettings = {
      "salesforcedx-vscode-core.show-cli-success-msg": false,
      "salesforcedx-vscode-core.push-or-deploy-on-save.enabled": true,
      "editor.formatOnSave": true,
      "editor.formatOnSaveTimeout": 5000,
      "search.exclude": {
        "**/node_modules": true,
        "**/dist": true,
        "**/*.meta.xml": true
      }
    };

    //deep merge... don't override user settings
    const mergedSettings = merge(defaultSettings, oldSettings);

    // Extend or create package.json file in destination path
    this.fs.write(vscodeSettingsPath, JSON.stringify(mergedSettings, null, 2));
  }

  private writeGitIgnore() {
    const ignorePath = this.destinationPath(".gitignore");
    const ignored = this.fs.exists(ignorePath)
      ? this.fs.read(ignorePath).split(EOL)
      : [];

    const defaultIgnores = ["dist/", "node_modules/"];
    const lines = new Set([...ignored, ...defaultIgnores]);
    this.fs.write(ignorePath, Array.from(lines).join(EOL));
  }

  public install() {
    this.installDependencies({
      bower: false,
      npm: true
    });
  }

  end() {}
};
