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
        .map((ann) => ({
          value: ann.description,
          // seems that this is not currently available :(
          // boundingPoly is always null in the response
          // TODO: enable boundingPoly when available
          // boundingPoly: ann.boundingPoly?.normalizedVertices ?? null,
          score: ann.score,
          // seems to be always zero
          // TODO: enable later when available
          // confidence: ann.confidence,
          topicality: ann.topicality,
          selected: false,
        }));
    logger.log(`Labels: ${labels.join(", ")}`);


    const safeSearch = response.safeSearchAnnotation;
    const isSafe = ["adult", "spoof", "medical", "violence", "racy"]
        .every((k) =>
          !["LIKELY", "VERY_LIKELY"].includes(safeSearch[k]));

    const labelMap = {};
    labels.forEach((label) => labelMap[label.value] = label);

    appendToImageMetaData(filename, {
      labels: labelMap,
      analyzed: firestore.Timestamp.now(),
      isSafe: isSafe, // TODO: add a job to delete unsafe images
    });
    logger.log("Stored metadata in Firestore");
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
