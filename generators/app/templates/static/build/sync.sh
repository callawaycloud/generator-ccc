#!/bin/bash
echo '== syncing production into master'
set -x;
git fetch
git checkout master
if [ "${1}" != "1" ]
then
  sfdx force:source:clean -n
  sfdx force:package:installed:list --json > sfdc-packages.json
  git status
  git add .
  git commit -m "[skip ci] Auto-Pull of Production" || echo "No changes to commit"
  git push
fi
git checkout $BITBUCKET_BRANCH
set +x;
