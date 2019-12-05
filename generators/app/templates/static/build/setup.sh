#!/bin/bash
echo 'y' | sfdx plugins:install sfdx-git-packager
echo 'y' | sfdx plugins:install force-source-clean
echo $AUTH_URL > $HOME/authurl
sfdx force:auth:sfdxurl:store -f $HOME/authurl --setdefaultusername -a prod
