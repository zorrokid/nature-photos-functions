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
  const contentType = event.data.contentType; // File content type.

  // Exit if this is triggered on a file that is not an image.
  if (!contentType.startsWith("image/")) {
    return logger.log("This is not an image.");
  }

  // Exit if the image is already a thumbnail.
  const fileName = path.basename(filePath);
  const parts = path.dirname(filePath).split(path.delimiter);

  logger.log("dirname parts " + parts.join(","));

  // check if the file is already a thumbnail (this function is triggered also on upload of a thumbnail)
  if (parts.length > 0 && parts[parts.length - 1] === "thumbnails") {
    return logger.log("Already a Thumbnail.");
  }

  // Open a stream for reading image from bucket.
  const bucket = getStorage().bucket(fileBucket);
  let readStream = bucket.file(filePath).createReadStream();

  readStream.on("error", (err) => {
    logger.error("Error reading image: " + err);
  });

  readStream.on("close", () => {
    logger.log("Finished reading image.");
  });

  const thumbFilePath = path.join(path.dirname(filePath), "thumbnails", fileName);

  // Open a stream for writing image to bucket.
  let writeStream = bucket.file(thumbFilePath).createWriteStream();

  writeStream.on("error", (err) => {
    logger.error("Error writing image: " + err);
  });

  writeStream.on("close", () => {
    logger.log("Finished writing image.");
  });

  // Create a image transformer 
  let transform = sharp()
    .resize({ 
      width: THUMBNAIL_WIDTH.value(), 
      height: THUMBNAIL_HEIGHT.value(), 
      withoutEnlargement: true,
    })
    .on("info", (info) => {
      logger.log("Image resized.");
    });

  // Pipe the image transformer to the bucket write stream
  readStream.pipe(transform).pipe(writeStream);
  logger.log("generateThumbnail finished.");

});