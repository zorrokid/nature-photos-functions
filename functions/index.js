const {initializeApp} = require("firebase-admin/app");
const {setGlobalOptions} = require("firebase-functions/v2");

setGlobalOptions({region: "europe-central2"});
initializeApp();

const imageAnalysis = require("./src/image_analysis");
const imageResize = require("./src/image_resize");
const uploadListener = require("./src/upload_listener");
exports.imageAnalysis = imageAnalysis.imageAnalysis;
exports.resizeImage = imageResize.resizeImage;
exports.uploadListener = uploadListener.uploadListener;
