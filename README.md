# Setting up environment for Firebase Functions

https://firebase.google.com/docs/functions/get-started?gen=2nd

# To test with emulator

    firebase emulators:start

Emulator UI is running by default in http://127.0.0.1:4000

- Click "Go to Storage Emulator"
- Select "Upload file" and select a file
- File should appear to list and later on the processed file should appear to list

# To deploy

    firebase deploy --only functions

# Configuration

- https://firebase.google.com/docs/functions/config-env?gen=2nd

# Storage

- Best practises: https://cloud.google.com/storage/docs/best-practices