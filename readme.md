# CCC Yeoman Generator

Yeoman generator used to setup & upgrade Callaway Salesforce development projects.

**Configures the following**

1. [bitbucket pipelines CI process](https://github.com/ChuckJonas/generator-ccc/blob/master/generators/app/templates/static/build/pipelines-setup.md)
2. prettier (with pre-commit hook)
3. default `package.xml` manifest
4. `.gitIgnore`
5. common scripts
6. vscode settings

## Usage

1. run `npm install -g yo`
2. run `npm install -g generator-ccc`
3. `cd` to project
4. run `yo ccc`

## Development

1. `git clone ...`
2. `npm install`
3. `npm link`
4. `npm run watch`
5. make changes
6. open test project.  Run `yo ccc`

## Scheduled Production Sync

#### Use
This pipeline enables production to sync automatically on a given interval(days) from the last production sync. 

#### Schedule Configuration

1. (Optional)Navigate to the bitbucket repository for desired project.
  - `Repository Settings` => `Repository Variables`
  - Enter variable `PRODUCTION_SYNC_INTERVAL`
  - Set `PRODUCTION_SYNC_INTERVAL` to desired interval(days)
  - If `PRODUCTION_SYNC_INTERVAL` is not set, it will be automatically assigned to an interval of 3 days.
2. Navigate to `Piplines` => `Schedules` in the repository.
  - click `New Schedule`
  - choose `master` branch
  - choose `Scheduled Production Sync`
  - recommended interval is `daily`
3. Click `Create` and your finished
