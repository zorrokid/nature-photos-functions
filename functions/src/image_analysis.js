const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const vision = require("@google-cloud/vision");
const {getFirestore} = require("firebase-admin/firestore");
const {firestore} = require("firebase-admin");

const client = new vision.ImageAnnotatorClient();

exports.imageAnalysis = onObjectFinalized({
  bucket: "flutter-nature-photos-image-analysis",
}, async (event) => {
  logger.log("imageAnalysis started.");
  /*
  Example event:
  Event: {
    "specversion":"1.0",
    "id":"07999975-2b37-4ee6-9b85-2274f7338fd1",
    "type":"google.cloud.storage.object.v1.finalized",
    "source":"//storage.googleapis.com/projects/_/buckets/
      flutter-nature-photos.appspot.com/objects/IMG_8491-test.JPG",
    "time":"2023-08-31T19:48:30.304Z",
    "data": {
      "kind":"storage#object",
      "name":"IMG_8491-test.JPG",
      "bucket":"flutter-nature-photos.appspot.com",
      "generation":"1693511310303",
      "metageneration":"1",
      "contentType":"image/jpeg",
      "timeCreated":"2023-08-31T19:48:30.304Z",
      "updated":"2023-08-31T19:48:30.304Z",
      "storageClass":"STANDARD",
      "size":"909025",
      "md5Hash":"z0Rvu1OWJraYXy1CpSFFBQ==",
      "etag":"PUxpci/dVFV4gRj4pBnSt7sxcTg",
      "metadata":{
        "firebaseStorageDownloadTokens":"12153ab8-5734-4a03-affb-b4deb492e2e5"},
        "crc32c":"sDGBZw==",
        "timeStorageClassUpdated":"2023-08-31T19:48:30.304Z",
        "id":"flutter-nature-photos.appspot.com/
          IMG_8491-test.JPG/1693511310303",
        "selfLink":"http://127.0.0.1:9199/storage/v1/b/flutter-nature-photos.appspot.com/o/IMG_8491-test.JPG","mediaLink":"http://127.0.0.1:9199/download/storage/v1/b/flutter-nature-photos.appspot.com/o/IMG_8491-test.JPG?generation=1693511310303&alt=media"
      }}
  */

  const filename = event.data.name;
  const filebucket = event.data.bucket;

  if (!filename) {
    logger.error("No filename");
    return;
  }

  logger.log(`New picture uploaded ${filename} in ${filebucket}`);

  const request = {
    image: {source: {imageUri: `gs://${filebucket}/${filename}`}},
    features: [
      {type: "LABEL_DETECTION"},
      {type: "IMAGE_PROPERTIES"},
      {type: "SAFE_SEARCH_DETECTION"},
    ],
  };

  // invoking the Vision API
  const [response] = await client.annotateImage(request);
  logger.log(`Raw vision output for: 
     ${filename}: ${JSON.stringify(response)}`);

  if (response.error === null) {
    // listing the labels found in the picture
    const labels = response.labelAnnotations
        .sort((ann1, ann2) => ann2.score - ann1.score)
        .map((ann) => ann.description);
    logger.log(`Labels: ${labels.join(", ")}`);

    // retrieving the dominant color of the picture
    const color = response.imagePropertiesAnnotation.dominantColors.colors
        .sort((c1, c2) => c2.score - c1.score)[0].color;
    const colorHex = decColorToHex(color.red, color.green, color.blue);
    logger.log(`Colors: ${colorHex}`);

    // determining if the picture is safe to show
    const safeSearch = response.safeSearchAnnotation;
    const isSafe = ["adult", "spoof", "medical", "violence", "racy"]
        .every((k) =>
          !["LIKELY", "VERY_LIKELY"].includes(safeSearch[k]));
    logger.log(`Safe? ${isSafe}`);

    // if the picture is safe to display, store it in Firestore
    if (isSafe) {
      const pictureStore = getFirestore().collection("pictures");
      const doc = pictureStore.doc(filename);
      await doc.set({
        labels: labels,
        color: colorHex,
        created: firestore.Timestamp.now(),
      }, {merge: true});

      logger.log("Stored metadata in Firestore");
    }
  } else {
    throw new Error(`Vision API error: code 
    ${response.error.code}, message: "${response.error.message}"`);
  }

  logger.log("Deleting analyzed file.");
  const bucket = getStorage().bucket(filebucket);
  const file = bucket.file(filename);
  file.delete().then(() => {
    logger.log("Analyzed file deleted successfully.");
  }).catch((error) => {
    logger.error("Error deleting analyzed file.", error);
  });
  logger.log("imageAnalysis completed");
});

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @return {string} The hex representation of the color.
 */
function decColorToHex(r, g, b) {
  return "#" + Number(r).toString(16).padStart(2, "0") +
    Number(g).toString(16).padStart(2, "0") +
    Number(b).toString(16).padStart(2, "0");
}
