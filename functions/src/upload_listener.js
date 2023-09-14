const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {appendToImageMetaData} = require("./utils/file_data_utils");
const logger = require("firebase-functions/logger");
const path = require("path");

exports.uploadListener = onObjectFinalized({
  bucket: "flutter-nature-photos-resize",
}, async (event) => {
  logger.log("bucketListener received event.");
  const filePath = event.data.name;

  if (!filePath) return;

  const fileName = path.basename(filePath);

  logger.log("filePath", filePath);

  const resized = filePath.startsWith("full/");
  const thumbnail = filePath.startsWith("thumbnail/");

  logger.log(`resized: ${resized}, thumbnail: ${thumbnail}`);

  if (!(resized || thumbnail)) return;

  const payload = resized ? {resized: true} : {thumbnail: true};

  appendToImageMetaData(fileName, payload);
  logger.log("bucketListener finished.");
});
