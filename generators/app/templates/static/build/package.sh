#!/bin/bash

echo 'merge master into branch'
git merge master

echo ''
echo 'building package'
sfdx git:package -d dist/$BITBUCKET_BRANCH -s $BITBUCKET_BRANCH --purge

echo ''
echo 'building backup'
sfdx git:package -d dist/backup -s master -t $BITBUCKET_BRANCH -f --purge

echo ''
echo 'package.xml for deployment'
cat dist/$BITBUCKET_BRANCH/package.xml
