# Known Metadata Packaging Issues

## Problems with Flow

There seems to be a bug, where reguardless of the API version specified in `sfdx-project.json`, it always pulls using the latest version of the API.  When you go to deploy, if your projects API version is incompataible, it will result in errors like:

- `queriedFields field is set, you also need to set the following fields: sObjectOutputReference.`
- `Property 'storeOutputAutomatically' not valid in version 45.0`

[Tracked Issue](https://github.com/forcedotcom/cli/issues/528)

### Resolution

Update the `sourceApiVersion` in `sfdx-project.json` to the latest version of the API available in production.  If the sandbox is pre-release, it might be possible that you cannot deploy to metadata retrieved from there.

## Cannot set sharingModel to ControlledByParent on a CustomObject without a MasterDetail relationship field

This happens when you attempt to deploy a change to an Object that is the child in a master-detail relationship and no changes were made to the M-D relationship.

[Reference](https://salesforce.stackexchange.com/questions/50354/cannot-set-sharingmodel-to-controlledbyparent-on-a-customobject-without-a-master)

### Resolution

Make a trivial change to the master-detail relationship (IE: add whitespace to description) so that it gets packaged into the Object metadata.

