#!/bin/bash

#Get Latest API version from sfdx instance
INSTANCE_URL=$(sfdx force:org:display --json | jq -r '.result.instanceUrl')/services/data
VERSIONS_LIST=$(curl $INSTANCE_URL)
VERSION_LIST_LENGTH=$(echo $VERSIONS_LIST | jq '. | length' | jq '.-1') 
LATEST_VERSION=$(echo $VERSIONS_LIST | jq -r ".[${VERSION_LIST_LENGTH}].version")

# Changing delimeter and assigning variables for read function for XML
read_package () {
    local IFS=\>
    read -d \< TAG VALUE
}

# Read xml and assign Manifest API value
while read_package; do
    if [[ $TAG = 'version' ]]; then
        MANIFEST_API_VERSION="$VALUE"
        break
    fi
done < ./manifest/package.xml

#Get API version from sfdx-project.json
PROJECT_API_VERSION=$(cat ./sfdx-project.json | jq -r '.sourceApiVersion') 

printf "Current Project API Version: $PROJECT_API_VERSION\n"

printf "Current Manifest API Version: $MANIFEST_API_VERSION\n"

printf "Latest API Version: $LATEST_VERSION\n"

regexForDecimal='^[0-9]+([.][0-9]+)?$' 
if ! [[ $MANIFEST_API_VERSION =~ $regexForDecimal ]]; then
    printf 'Uh Oh! Something went wrong while retrieving the API Version'
    exit
fi

printf '\n'

# Create Integers for Comparison
LATEST_VERSION_INT=${LATEST_VERSION%.*}
MANIFEST_API_VERSION_INT=${MANIFEST_API_VERSION%.*}
PROJECT_API_VERSION_INT=${PROJECT_API_VERSION%.*}

# 
if [ $LATEST_VERSION_INT -gt $MANIFEST_API_VERSION_INT ]; then 
    printf 'Manifest Api Version is out of date.\nUpdating...\n'
    sed -i "s/<version>[0-9][0-9]\.[0-9]/<version>$LATEST_VERSION/" ./manifest/package.xml
    printf 'Version updated in package.xml\n'
fi

if [ $LATEST_VERSION_INT -gt $PROJECT_API_VERSION_INT ]; then 
    printf 'Project Api Version is out of date.\nUpdating...\n'
    cat ./sfdx-project.json | jq --arg LATEST_V $LATEST_VERSION '.sourceApiVersion = $LATEST_V' |  echo "$(jq .)" > ./sfdx-project.json
    printf 'sourceApiVersion updated in sfdx-project.json\n'
    exit 0;
fi
printf "API Version Is Up To Date!"
exit 0;