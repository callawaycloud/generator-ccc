#!/bin/bash
echo '== syncing production into master'
set -x;
git fetch
git checkout master
sfdx force:source:clean -n
git status
git add .
git commit -m "[skip ci] Auto-Pull of Production" || echo "No changes to commit"
git push
git checkout $BITBUCKET_BRANCH
set +x;
