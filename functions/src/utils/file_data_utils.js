const {getFirestore} = require("firebase-admin/firestore");

const getFileKey = (filename) => filename.split(".")[0];

exports.appendToImageMetaData = async (filename, data) => {
  const documentKey = getFileKey(filename);
  const pictureStore = getFirestore().collection("uploadFileInfo");
  const doc = pictureStore.doc(documentKey);
  await doc.set({
    ...data,
  }, {merge: true});
};
