const {getFirestore} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

const getFileKey = (filename) => filename.split(".")[0];
const getDocument = (documentKey) =>
  getFirestore().collection("imageInfo").doc(documentKey);

exports.appendLabelsToImageMetaData = async (filename, labels, data) => {
  logger.log("appendLabelsToImageMetaData", data);
  const documentKey = getFileKey(filename);
  const doc = getDocument(documentKey);
  const labelCollection = doc.collection("labels");
  labels.forEach((label) => {
    labelCollection.doc(label.value).set(label);
  });
  await doc.set(data, {merge: true});
};

exports.appendToImageMetaData = async (filename, data) => {
  logger.log("appendToImageMetaData", data);
  const documentKey = getFileKey(filename);
  const doc = getDocument(documentKey);
  await doc.set(data, {merge: true});
};
