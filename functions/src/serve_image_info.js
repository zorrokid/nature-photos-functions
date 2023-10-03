const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");

const cacheExpirationInSeconds = 60 * 60 * 24;
const cdnCacheExpirationInSeconds = 60 * 60 * 24 * 2;
const fileBucket = "flutter-nature-photos-resize";

exports.getImageInfo = onRequest({
  cors: true,
}, async (request, response) => {
  const db = getFirestore();
  const returnData = [];
  const imageInfoCollection = db.collection("imageInfo");
  const imageInfoSnapshot = await imageInfoCollection.get();
  for (const doc of imageInfoSnapshot.docs) {
    const labels = [];
    const labelsSnapshot = await doc.ref.collection("labels").get();
    for (const labelDoc of labelsSnapshot.docs) {
      labels.push(labelDoc.id);
    }
    const downloadUrls =
      await getDownloadUrls(doc.id, cdnCacheExpirationInSeconds);
    const imageInfo = {
      "id": doc.id,
      ...doc.data(),
      labels,
      ...downloadUrls,
    };
    returnData.push(imageInfo);
  }
  const ret = JSON.stringify(returnData);
  // public: both the browser and CDN for Firebase Hosting can cache the content
  response.set("Cache-Control", getCacheControlHeader());
  response.setHeader("Content-Type", "application/json");
  response.status(200).send(ret);
  response.end();
});

const getCacheControlHeader = () =>
  [
    "public",
    `max-age=${cacheExpirationInSeconds}`,
    `s-maxage=${cdnCacheExpirationInSeconds}`,
  ].join(", ");

const getDownloadUrls = async (id, expirationTimeSpanSeconds) => {
  const signedUrlOptions = {
    version: "v4",
    action: "read",
    expires: Date.now() + expirationTimeSpanSeconds * 1000,
  };

  const bucket = getStorage().bucket(fileBucket);
  const thumbFile = bucket.file(`thumbnail/${id}.jpg`);
  const fullFile = bucket.file(`full/${id}.jpg`);

  const results = await Promise.all([
    thumbFile.getSignedUrl(signedUrlOptions),
    fullFile.getSignedUrl(signedUrlOptions),
  ]);

  const thumbResult = results[0];
  const originalResult = results[1];
  const thumbFileUrl = thumbResult[0];
  const fullFileUrl = originalResult[0];

  return {
    thumbnailurl: thumbFileUrl,
    fullSizeUrl: fullFileUrl,
  };
};
