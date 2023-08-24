const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {initializeApp} = require("firebase-admin/app");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const path = require("path");

const sharp = require("sharp");
const { defineInt, defineString } = require("firebase-functions/params");

initializeApp();

const THUMBNAIL_WIDTH = defineInt("THUMBNAIL_WIDTH", 200);
const THUMBNAIL_HEIGHT = defineInt("THUMBNAIL_HEIGHT", 200);
const IMAGE_MAX_WIDTH = defineInt("IMAGE_MAX_WIDTH", 200);
const IMAGE_MAX_HEIGHT = defineInt("IMAGE_MAX_HEIGHT", 200);
const SOURCE_FOLDER = defineString("SOURCE_FOLDER", "upload");
const RESIZE_FOLDER = defineString("RESIZE_FOLDER", "resized");
const THUMBNAIL_FOLDER = defineString("THUMBNAIL_FOLDER", "thumbnail");

const IMAGE_RESIZE_INVALID_EVENT = 0;
const IMAGE_RESIZE_SOURCE_FOLDER_EVENT = 1;
const IMAGE_RESIZE_RESIZE_FOLDER_EVENT = 2;

exports.resizeImage = onObjectFinalized({cpu: 2}, async (event) => {
  logger.log("resizeImage started.");
  const eventData = parseEvent(event);
  if (!isValidImageEvent(eventData)) return;
  const readStream = getReadStream(eventData);
  const transformSettings = getTransformSettings(eventData);
  const writeStream = getWriteStream(eventData.bucket, getTargetFilePath(eventData, transformSettings));
  readStream.pipe(getImageResizeTransform(transformSettings)).pipe(writeStream);
  logger.log("resizeImage finished.");
});

const getTransformSettings = (eventData) => {
  switch(eventData.eventType) {
    case IMAGE_RESIZE_RESIZE_FOLDER_EVENT:
    return {
      width: THUMBNAIL_WIDTH.value(),
      height: THUMBNAIL_HEIGHT.value(),
      targetFolder: THUMBNAIL_FOLDER.value(),
    }
    case IMAGE_RESIZE_SOURCE_FOLDER_EVENT:
      return {
        width: IMAGE_MAX_WIDTH.value(),
        height: IMAGE_MAX_HEIGHT.value(),
        targetFolder: RESIZE_FOLDER.value(),
      };
  }
}

const getEventTypeBySourceFolder = (sourceFolder) => {
  switch(sourceFolder) {
    case SOURCE_FOLDER.value():
      return IMAGE_RESIZE_SOURCE_FOLDER_EVENT;
    case RESIZE_FOLDER.value():
      return IMAGE_RESIZE_RESIZE_FOLDER_EVENT;
    default:
      return IMAGE_RESIZE_INVALID_EVENT;
  }
}

const parseEvent = (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;
  const fileName = path.basename(filePath);
  const parts = path.dirname(filePath).split("/");
  const sourceFolder = parts.length > 0 ? parts[parts.length - 1] : null;
  const bucket = getStorage().bucket(fileBucket);

   return {
    bucket,
    filePath,
    fileName,
    sourceFolder,
    eventType: getEventTypeBySourceFolder(sourceFolder),
    contentType: event.data.contentType,
  }
}

const isValidImageEvent = (eventData) => {
  if (!isImage(eventData)) {
    logger.log("This is not an image.");
    return false;
  }
  if (eventData.eventType === IMAGE_RESIZE_INVALID_EVENT) {
    logger.log("Invalid image resize event.");
    return false;
  }
  return true;
}

const getTargetFilePath = (eventData, transformSettings) => {
  return path.join(transformSettings.targetFolder, eventData.fileName);
 }

const getImageResizeTransform = (transformSettings) =>
  sharp()
    .resize({ 
      width: transformSettings.width, 
      height: transformSettings.height, 
      withoutEnlargement: true,
    })
    .on("info", (info) => {
      logger.log(`Image resized to ${transformSettings.width}x${transformSettings.height}.`);
    });

const getReadStream = (eventData) => {
  // Open a stream for reading image from bucket.
  let readStream = eventData.bucket.file(eventData.filePath).createReadStream();

  readStream.on("error", (err) => {
    logger.error("Error reading image: " + err);
  });

  readStream.on("close", () => {
    logger.log("Finished reading image.");
  });
  return readStream;
}

const getWriteStream = (bucket, targetFilePath) => {
  // Open a stream for writing image to bucket.
  let writeStream = bucket.file(targetFilePath).createWriteStream();

  writeStream.on("error", (err) => {
    logger.error("Error writing image: " + err);
  });

  writeStream.on("close", () => {
    logger.log("Finished writing image.");
  });
  return writeStream;
}

const isImage = (eventData) => eventData.contentType.startsWith("image/");