const Generator = require("yeoman-generator");
const chalk = require("chalk");
const yosay = require("yosay");
const path = require("path");
const EOL = require("os").EOL;
module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);
  }

  prompting() {
    // Have Yeoman greet the user.
    this.log(yosay(`Hello World`));

    const prompts = [
      {
        type: "confirm",
        name: "preCommitPrettier",
        message: "Run Prettier on pre-commit",
        default: true
      },
      {
        type: "confirm",
        name: "pipelines",
        message: "Create Bitbucket Pipelines",
        default: true
      }
    ];

    return this.prompt(prompts).then(props => {
      // To access props later use this.props.someAnswer;
      this.props = props;
    });
  }

  writing() {
    // this.destinationRoot(path.join(".", this.options.appname));

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

  writeNpmPackage() {
    // Extend or create package.json file in destination path
    const pkgJson = {
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

    this.fs.extendJSON(this.destinationPath("package.json"), pkgJson);
  }

  writePrettier() {
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

  writeVscodeSettings() {
    //prettier
    const settings = {
      "salesforcedx-vscode-core.show-cli-success-msg": false,
      "search.exclude": {
        "**/node_modules": true,
        "**/dist": true
      },
      "salesforcedx-vscode-core.push-or-deploy-on-save.enabled": true
    };

    // Extend or create package.json file in destination path
    this.fs.extendJSON(
      this.destinationPath(path.join(".vscode", "settings.json")),
      settings
    );
  }

  writeGitIgnore() {
    const ignorePath = this.destinationPath(".gitignore");
    try {
      const gitIgnore = this.fs.read();
      const lines = new Set([...gitIgnore.split(EOL), ...["dist"]]);
      this.fs.write(ignorePath, lines.join(EOL));
    } catch (e) {}
  }

  install() {
    this.installDependencies({
      bower: false,
      npm: true
    });
  }

  end() {}
};
