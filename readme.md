# CCC Yeoman Generator

Yeoman generator used to setup & upgrade Callaway Salesforce development projects.

**Configures the following**

1. [bitbucket pipelines CI process](https://github.com/ChuckJonas/generator-ccc/blob/master/generators/app/templates/static/build/pipelines-setup.md)
1. prettier (with pre-commit hook)
1. default `package.xml` manifest
1. `.gitIgnore`
1. common scripts
1. vscode settings

## Usage

1. run `npm install -g yeoman`
2. run `npm install -g generator-ccc`
3. `cd` to project
4. run `yo ccc`
