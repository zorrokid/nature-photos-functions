const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {initializeApp} = require("firebase-admin/app");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const path = require("path");

const sharp = require("sharp");
const {defineInt, defineString} = require("firebase-functions/params");
const {setGlobalOptions} = require("firebase-functions/v2");

setGlobalOptions({region: "europe-central2"});

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

// vision API - split these into separate files
const vision = require("@google-cloud/vision");
// const Storage = require("@google-cloud/storage");
const Firestore = require("@google-cloud/firestore");

const client = new vision.ImageAnnotatorClient();

exports.vision_analysis = onObjectFinalized({cpu: 2}, async (event) => {
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
  logger.log(`Event: ${JSON.stringify(event)}`);

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
      const pictureStore = new Firestore().collection("pictures");

      const doc = pictureStore.doc(filename);
      await doc.set({
        labels: labels,
        color: colorHex,
        created: Firestore.Timestamp.now(),
      }, {merge: true});

      logger.log("Stored metadata in Firestore");
    }
  } else {
    throw new Error(`Vision API error: code 
    ${response.error.code}, message: "${response.error.message}"`);
  }
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

exports.resizeImage = onObjectFinalized({cpu: 2}, async (event) => {
  logger.log("resizeImage started.");
  const eventData = parseEvent(event);
  if (!eventData) {
    logger.error("No event data.");
  }
  if (!isValidImageEvent(eventData)) return;
  const readStream = getReadStream(eventData);
  const transformSettings = getTransformSettings(eventData);
  const writeStream = getWriteStream(
      eventData.bucket, getTargetFilePath(eventData, transformSettings));
  readStream.pipe(getImageResizeTransform(transformSettings)).pipe(writeStream);
  logger.log("resizeImage finished.");
});

const getTransformSettings = (eventData) => {
  switch (eventData.eventType) {
    case IMAGE_RESIZE_RESIZE_FOLDER_EVENT:
      return {
        width: THUMBNAIL_WIDTH.value(),
        height: THUMBNAIL_HEIGHT.value(),
        targetFolder: THUMBNAIL_FOLDER.value(),
      };
    case IMAGE_RESIZE_SOURCE_FOLDER_EVENT:
      return {
        width: IMAGE_MAX_WIDTH.value(),
        height: IMAGE_MAX_HEIGHT.value(),
        targetFolder: RESIZE_FOLDER.value(),
      };
  }
};

const getEventTypeBySourceFolder = (sourceFolder) => {
  switch (sourceFolder) {
    case SOURCE_FOLDER.value():
      return IMAGE_RESIZE_SOURCE_FOLDER_EVENT;
    case RESIZE_FOLDER.value():
      return IMAGE_RESIZE_RESIZE_FOLDER_EVENT;
    default:
      return IMAGE_RESIZE_INVALID_EVENT;
  }
};

const parseEvent = (event) => {
  logger.log("Parsing event.", event);
  const fileBucket = event.data.bucket;
  logger.log("File bucket parsed.", fileBucket);
  const filePath = event.data.name;
  logger.log("File path parsed.", filePath);
  const fileName = path.basename(filePath);
  logger.log("File name parsed.", fileName);
  const parts = path.dirname(filePath).split("/");
  const sourceFolder = parts.length > 0 ? parts[parts.length - 1] : null;
  logger.log("Source folder parsed.", sourceFolder);
  const bucket = getStorage().bucket(fileBucket);

  return {
    bucket,
    filePath,
    fileName,
    sourceFolder,
    eventType: getEventTypeBySourceFolder(sourceFolder),
    contentType: event.data.contentType,
  };
};

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
};

const getTargetFilePath = (eventData, transformSettings) => {
  return path.join(transformSettings.targetFolder, eventData.fileName);
};

const getImageResizeTransform = (transformSettings) =>
  sharp()
      .resize({
        width: transformSettings.width,
        height: transformSettings.height,
        withoutEnlargement: true,
      })
      .on("info", (info) => {
        logger.log(
            `Image resized to 
              ${transformSettings.width}x${transformSettings.height}`,
        );
      });

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
