# Setting up environment for Firebase Functions

https://firebase.google.com/docs/functions/get-started?gen=2nd

# To test with emulator

    firebase emulators:start

Emulator UI is running by default in http://127.0.0.1:4000

- Click "Go to Storage Emulator"
- Select "Upload file" and select a file
- File should appear to list and later on the processed file should appear to list

## To find problems with emulator

    firebase emulators:start --debug

# To deploy

    firebase deploy --only functions

# To view logs

    firebase functions:log

# Configuration

- https://firebase.google.com/docs/functions/config-env?gen=2nd

# Storage

- Best practises: https://cloud.google.com/storage/docs/best-practices

# Image analysis

https://cloud.google.com/vision/docs/supported-files

"To enable accurate image detection within the Vision API, images should generally be a minimum of 640 x 480 pixels (about 300k pixels)."

"smaller sizes may result in lower accuracy, while larger sizes may increase processing time and bandwidth usage without providing comparable benefits in accuracy."

# Signed URL's

https://cloud.google.com/storage/docs/access-control/signed-urls
https://cloud.google.com/storage/docs/access-control/signing-urls-with-helpers#client-libraries

## Troubleshooting

"Error: Permission 'iam.serviceAccounts.signBlob' denied on resource (or it may not exist)."

"If you are using 2nd gen Cloud Function, you need to give Service Account Token Creator to the 2nd gen's service"
- https://stackoverflow.com/questions/57564505/unable-to-assign-iam-serviceaccounts-signblob-permission

=> Added "Service Account Token Creator" role to "Default compute service account" principal, fixed the problem.