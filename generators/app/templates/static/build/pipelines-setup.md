# ⚡️🤘⚡️Callaway Cloud CI ⚡️🤘⚡️

This guide will outline the steps to setup and use a bitbucket pipeline for auto-deployments.

<img width="1370" alt="callawaycloud___realself___Pipelines_—_Bitbucket" src="https://user-images.githubusercontent.com/5217568/70212789-2d3d1d80-16f5-11ea-8795-93aac82fdde6.png">

_NOTE:_ This setup currently only works with the "Org Development Model" (Manifest Projects).

## 💪 Goals

1. Make it easy to validate changes on Pull Request
2. Handle 75-90% of deployments automatically. Exceptions:

- Metadata not tracked in source control (email template, etc
- Complex destructive changes
- Profile configurations
- Data configuration

3. Only Deploy metadata that has changed.
4. Make it impossible to overwrite changes that have been introduced outside of our source control (dang :wombats:)
5. Keep `master` in sync with production
6. Do all of this without overloading the deployment queue

## 🔧 Setup

### Build Assets

The easiest way to add this pipeline to a project is to use the callaway yeoman generator:

1. run `npm install -g yeoman`
2. run `npm install -g generator-ccc`
3. navigate to project root
4. run `npm yo ccc`

Alternately, you could copy the `build` folder + `bitbucket-pipelines.yml` to your project.

### Environment Setup

1. Authorize the production org with sfdx-cli
1. Run `sfdx force:org:display --verbose -u your-prod-user`. Copy the returned "Sfdx Auth Url"
1. Open the repo in bitbucket and navigate to Settings -> Repository variables.
1. Create a new variable called AUTH_URL. **MAKE SURE TO CHECK THE SECURE OPTION!!!**

## 🌊 Pipeline Steps

### "Build Package"

**Trigger:** On Pull Request Created/Updated

This is an automatic step that when a pull request is submitted and updated to prepare a deployment package.

It does so by preforming the following steps:

1. It syncs Production into `master` (using [force:source:clean](https://github.com/ChuckJonas/force-source-clean)) and pushes the changes
2. It merges `master` into the current branch
3. It generates an incremental deployment package based on the difference between `master` and the current branch (using [sfdx-git-packager](https://github.com/ChuckJonas/sfdx-git-packager))

After completing, you can inspect the package by downloading the "artifacts".

⁉️ Merge conflict

If you encounter merge conflicts, that means that a file you've changed in your current branch has also been updated in production by some rogue :wombat:.

Checkout master and locally merge the conflicts. Push and the PR pipeline will automatically run again.

### "Check Package"

**Trigger:** Manual

This step preforms a `--CHECKONLY` deployment with the generated package.

⁉️ **Missing Metadata Dependencies**

- If it's something we track in source control, pull it down/commit/push and try again.
- Otherwise, you will need to manually deploy it via a changeset or other means.

⁉️ **Failed Tests**

Ideally you should fix the tests, commit changes, and try again. However, if the test failures are not related to you changes, you can manually run the pipeline with selective tests.

⁉️ **Contains destructive changes which cannot be deployed atomicity**

This may require you to run multiple manual test

### "Quick Deploy"

**Trigger:** Manual

1. Completes the deployment you previously checked
2. Merges the current branch into `master`

No additional steps are required to close the pull request, although you might want to delete the remote branch.

⁉️ **Deployment Failed**

Most likely the [previously checked deployment is no longer valid](https://salesforce.stackexchange.com/questions/187859/what-operations-would-cause-a-validated-changeset-to-become-invalidated-and-lose).
