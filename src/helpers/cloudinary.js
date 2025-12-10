// helpers/cloudinary.js
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

exports.uploadToCloudinary = (filePath) => {
  return cloudinary.uploader.upload(filePath, { folder: "kyc_sandbox" });
};
