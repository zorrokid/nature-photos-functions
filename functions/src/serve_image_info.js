const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");

exports.getImageInfo = onRequest({
  cors: false,
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
    const imageInfo = {
      "id": doc.id,
      ...doc.data(),
      labels,
    };
    returnData.push(imageInfo);
  }
  const ret = JSON.stringify(returnData);
  response.set("Cache-Control", "public, max-age=300, s-maxage=600");
  response.setHeader("Content-Type", "application/json");
  response.status(200).send(ret);
  response.end();
});
