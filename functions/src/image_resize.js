const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const path = require("path");
const sharp = require("sharp");
const {defineInt} = require("firebase-functions/params");
const util = require("util");
const stream = require("stream");
const pipeline = util.promisify(stream.pipeline);

const IMAGE_MAX_WIDTH_THUMBNAIL = defineInt("THUMBNAIL_WIDTH", 150);
const IMAGE_MAX_HEIGHT_THUMBNAIL = defineInt("THUMBNAIL_HEIGHT", 150);
const IMAGE_MAX_WIDTH_FULL = defineInt("IMAGE_MAX_WIDTH", 1200);
const IMAGE_MAX_HEIGHT_FULL = defineInt("IMAGE_MAX_HEIGHT", 630);
const IMAGE_MAX_WIDTH_ANALYSIS = defineInt("IMAGE_MAX_WIDTH_ANALYSIS", 640);
const IMAGE_MAX_HEIGHT_ANALYSIS = defineInt("IMAGE_MAX_HEIGHT_ANALYSIS", 480);
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// scoped on default bucket
exports.resizeImage = onObjectFinalized({
  bucket: "flutter-nature-photos.appspot.com",
}, async (event) => {
  logger.log("resizeImage started.");
  const eventData = parseEvent(event);
  if (!eventData) {
    logger.error("No event data.");
  }
  if (!isValidImageEvent(eventData)) return;
  const readStream = getReadStream(eventData);
  const resizeBucket = getStorage().bucket("flutter-nature-photos-resize");
  const analysisBucket = getStorage()
      .bucket("flutter-nature-photos-image-analysis");

  const sharpStream = sharp({failOn: "none"});
  const promises = [
    pipeline(readStream, sharpStream),
    pipeline(sharpStream.clone().resize({
      width: IMAGE_MAX_WIDTH_FULL.value(),
      height: IMAGE_MAX_HEIGHT_FULL.value(),
      withoutEnlargement: true,
    }), getWriteStream(resizeBucket,
        path.join("full", eventData.fileName))),
    pipeline(sharpStream.clone().resize({
      width: IMAGE_MAX_WIDTH_THUMBNAIL.value(),
      height: IMAGE_MAX_HEIGHT_THUMBNAIL.value(),
      withoutEnlargement: true,
    }), getWriteStream(resizeBucket,
        path.join("thumbnail", eventData.fileName))),
    pipeline(sharpStream.clone().resize({
      width: IMAGE_MAX_WIDTH_ANALYSIS.value(),
      height: IMAGE_MAX_HEIGHT_ANALYSIS.value(),
      withoutEnlargement: true,
    }), getWriteStream(analysisBucket,
        eventData.fileName)),
  ];

  Promise.all(promises).then((_) => {
    logger.log("All resizes done.");
  }).catch((error) => {
    logger.error("Error resizing image", error);
  }).finally(() => {
    logger.log("Deleting upload file.");
    const file = eventData.bucket.file(eventData.filePath);
    file.delete().then(() => {
      logger.log("Upload file deleted successfully");
    }).catch((error) => {
      logger.error("Error deleting upload file", error);
    });
  });

  logger.log("resizeImage finished.");
});


const parseEvent = (event) => {
  logger.log("Parsing event.", event);
  const fileBucket = event.data.bucket;
  logger.log("File bucket parsed.", fileBucket);
  const filePath = event.data.name;
  logger.log("File path parsed.", filePath);
  const fileName = path.basename(filePath);
  logger.log("File name parsed.", fileName);
  const bucket = getStorage().bucket(fileBucket);
  const size = event.data.size;
  logger.log("File size parsed.", size);

  return {
    bucket,
    filePath,
    fileName,
    contentType: event.data.contentType,
    size,
  };
};

const isValidImageEvent = (eventData) => {
  if (!isImage(eventData)) {
    logger.log("This is not an image.", eventData);
    return false;
  }
  if (eventData.size > MAX_FILE_SIZE_BYTES) {
    logger.log("File size exceeds the maximum allowed size.",
        MAX_FILE_SIZE_BYTES);
    return false;
  }
  return true;
};

const getReadStream = (eventData) => {
  // Open a stream for reading image from bucket.
  const readStream =
    eventData.bucket.file(eventData.filePath).createReadStream();

  readStream.on("error", (err) => {
    logger.error("Error reading image", err);
  });

  readStream.on("close", () => {
    logger.log("Finished reading image.", eventData.filePath);
  });
  return readStream;
};

const getWriteStream = (bucket, targetFilePath) => {
  // Open a stream for writing image to bucket.
  const writeStream = bucket.file(targetFilePath).createWriteStream();

  writeStream.on("error", (err) => {
    logger.error("Error writing image ", err);
  });

  writeStream.on("close", () => {
    logger.log("Finished writing image.", targetFilePath);
  });
  return writeStream;
};

const isImage = (eventData) => eventData.contentType.startsWith("image/");
