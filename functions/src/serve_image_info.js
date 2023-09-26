const {onRequest} = require("firebase-functions/v2/https");

exports.test = onRequest({
  cors: false,
}, (request, response) => {
  response.status(200).send("Just a test");
});
