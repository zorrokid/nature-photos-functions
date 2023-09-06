const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const vision = require("@google-cloud/vision");
const {firestore} = require("firebase-admin");
const {appendToImageMetaData} = require("./utils/file_data_utils");

const client = new vision.ImageAnnotatorClient();

exports.imageAnalysis = onObjectFinalized({
  bucket: "flutter-nature-photos-image-analysis",
}, async (event) => {
  logger.log("imageAnalysis started.");

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

    // if the picture is safe to display, store data to Firestore
    if (isSafe) {
      appendToImageMetaData(filename, {
        labels: labels,
        color: colorHex,
        analyzed: firestore.Timestamp.now(),
      });
      logger.log("Stored metadata in Firestore");
    } else {
      // TODO: delete picture from storage
      logger.log("Picture is not safe to display");
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
