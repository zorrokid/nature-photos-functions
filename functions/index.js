const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {initializeApp} = require("firebase-admin/app");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const path = require("path");

const sharp = require("sharp");
const { defineInt } = require("firebase-functions/params");

initializeApp();

const THUMBNAIL_WIDTH = defineInt("THUMBNAIL_WIDTH", 200);
const THUMBNAIL_HEIGHT = defineInt("THUMBNAIL_HEIGHT", 200);

/**
 * When an image is uploaded in the Storage bucket,
 * generate a thumbnail automatically using sharp.
 */
exports.generateThumbnail = onObjectFinalized({cpu: 2}, async (event) => {
  logger.log("generateThumbnail started.");

  const fileBucket = event.data.bucket; // Storage bucket containing the file.
  const filePath = event.data.name; // File path in the bucket.
  
  if (!isImage(event.data)) {
    return logger.log("This is not an image.");
  }
  
  if (isThumbnail(filePath)) {
    return logger.log("Already a Thumbnail.");
  }
    
  const bucket = getStorage().bucket(fileBucket);
  const readStream = getReadStream(bucket, filePath);
  const writeStream = getWriteStream(bucket, getThumbnailPath(filePath));
  readStream.pipe(getTransform()).pipe(writeStream);

  logger.log("generateThumbnail finished.");
});

const getThumbnailPath = (filePath) => {
  const fileName = path.basename(filePath);
  return path.join(path.dirname(filePath), "thumbnails", fileName);
 }

const getTransform = () =>
  sharp()
    .resize({ 
      width: THUMBNAIL_WIDTH.value(), 
      height: THUMBNAIL_HEIGHT.value(), 
      withoutEnlargement: true,
    })
    .on("info", (info) => {
      logger.log("Image resized.");
    });

const getReadStream = (bucket, filePath) => {
  // Open a stream for reading image from bucket.
  let readStream = bucket.file(filePath).createReadStream();

  readStream.on("error", (err) => {
    logger.error("Error reading image: " + err);
  });

  readStream.on("close", () => {
    logger.log("Finished reading image.");
  });
  return readStream;
}

const getWriteStream = (bucket, thumbFilePath) => {
  // Open a stream for writing image to bucket.
  let writeStream = bucket.file(thumbFilePath).createWriteStream();

  writeStream.on("error", (err) => {
    logger.error("Error writing image: " + err);
  });

  writeStream.on("close", () => {
    logger.log("Finished writing image.");
  });
  return writeStream;
}

const isThumbnail = (filePath) => {
  const parts = path.dirname(filePath).split(path.delimiter);
  if (parts.length > 0 && parts[parts.length - 1] === "thumbnails") {
    return true;
  }
  return false;
}

const isImage = (fileData) => fileData.contentType.startsWith("image/");