#!/bin/bash
echo 'merge master into branch'
git merge master
echo 'building package'
sfdx git:package -d dist/$BITBUCKET_BRANCH -s $BITBUCKET_BRANCH --purge
cat dist/$BITBUCKET_BRANCH/package.xml
