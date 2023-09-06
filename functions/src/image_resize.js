const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const path = require("path");
const sharp = require("sharp");
const {defineInt} = require("firebase-functions/params");
const {appendToImageMetaData} = require("./utils/file_data_utils");

const IMAGE_MAX_WIDTH_THUMBNAIL = defineInt("THUMBNAIL_WIDTH", 150);
const IMAGE_MAX_HEIGHT_THUMBNAIL = defineInt("THUMBNAIL_HEIGHT", 150);
const IMAGE_MAX_WIDTH_FULL = defineInt("IMAGE_MAX_WIDTH", 1200);
const IMAGE_MAX_HEIGHT_FULL = defineInt("IMAGE_MAX_HEIGHT", 630);
const IMAGE_MAX_WIDTH_ANALYSIS = defineInt("IMAGE_MAX_WIDTH_ANALYSIS", 640);
const IMAGE_MAX_HEIGHT_ANALYSIS = defineInt("IMAGE_MAX_HEIGHT_ANALYSIS", 480);
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// scoped on default bucket
exports.resizeImage = onObjectFinalized({cpu: 2}, async (event) => {
  /* example event:
  {
    "specversion":"1.0",
    "id":"1cb1fc3d-1067-4e3e-b2df-4526c0c0f8a0",
    "type":"google.cloud.storage.object.v1.finalized",
    "source":"//storage.googleapis.com/projects/_/buckets/
      flutter-nature-photos.appspot.com/objects/IMG_8491-test.JPG",
    "time":"2023-09-04T18:00:18.840Z",
    "data": {
        "kind":"storage#object",
        "name":"IMG_8491-test.JPG",
        "bucket":"flutter-nature-photos.appspot.com",
        "generation":"1693850418840",
        "metageneration":"1",
        "contentType":"image/jpeg",
        "timeCreated":"2023-09-04T18:00:18.840Z",
        "updated":"2023-09-04T18:00:18.840Z",
        "storageClass":"STANDARD",
        "size":"909025",
        "md5Hash":"z0Rvu1OWJraYXy1CpSFFBQ==",
        "etag":"WiUvs0FNcq5sz1oNWeERXPyPRhY",
        "metadata": {
          "firebaseStorageDownloadTokens":"dbd6d9a0-5d77-494b-ba13-9ca89f9706f7"
        },
        "crc32c":"sDGBZw==",
        "timeStorageClassUpdated":"2023-09-04T18:00:18.840Z",
        "id":"flutter-nature-photos.appspot.com/
          IMG_8491-test.JPG/1693850418840",
        "selfLink":"http://127.0.0.1:9199/storage/v1/b/flutter-nature-photos.appspot.com/o/IMG_8491-test.JPG",
        "mediaLink":"http://127.0.0.1:9199/download/storage/v1/b/flutter-nature-photos.appspot.com/o/IMG_8491-test.JPG?generation=1693850418840&alt=media"
      },
    "severity":"INFO"
    }
  */

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
  const promises = [];

  promises.push(
      sharpStream.clone()
          .resize({
            width: IMAGE_MAX_WIDTH_FULL.value(),
            height: IMAGE_MAX_HEIGHT_FULL.value(),
            withoutEnlargement: true,
          })
          .pipe(getWriteStream(resizeBucket,
              path.join("full", eventData.fileName))),
  );

  promises.push(
      sharpStream.clone()
          .resize({
            width: IMAGE_MAX_WIDTH_THUMBNAIL.value(),
            height: IMAGE_MAX_HEIGHT_THUMBNAIL.value(),
            withoutEnlargement: true,
          })
          .pipe(getWriteStream(resizeBucket,
              path.join("thumbnail", eventData.fileName))),
  );

  promises.push(
      sharpStream.clone()
          .resize({
            width: IMAGE_MAX_WIDTH_ANALYSIS.value(),
            height: IMAGE_MAX_HEIGHT_ANALYSIS.value(),
            withoutEnlargement: true,
          })
          .pipe(getWriteStream(analysisBucket, eventData.fileName)),
  );

  readStream.pipe(sharpStream);

  Promise.all(promises).then((res) => {
    logger.log("All resizes done.");
  }).catch((error) => {
    logger.error("Error resizing image", error);
  }).finally(() => {
    // TODO: should this be in different function
    // triggered by saving to resize bucket?
    appendToImageMetaData(eventData.fileName, {
      resized: true,
      thumbnail: true,
    });
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
    logger.log("This is not an image.");
    return false;
  }
  if (eventData.size > MAX_FILE_SIZE_BYTES) {
    logger.log("File size exceeds the maximum allowed size.");
    return false;
  }
  return true;
};

const getReadStream = (eventData) => {
  // Open a stream for reading image from bucket.
  const readStream =
    eventData.bucket.file(eventData.filePath).createReadStream();

  readStream.on("error", (err) => {
    logger.error("Error reading image: " + err);
  });

  readStream.on("close", () => {
    logger.log("Finished reading image.");
  });
  return readStream;
};

const getWriteStream = (bucket, targetFilePath) => {
  // Open a stream for writing image to bucket.
  const writeStream = bucket.file(targetFilePath).createWriteStream();

  writeStream.on("error", (err) => {
    logger.error("Error writing image: " + err);
  });

  writeStream.on("close", () => {
    logger.log("Finished writing image.");
  });
  return writeStream;
};

const isImage = (eventData) => eventData.contentType.startsWith("image/");
