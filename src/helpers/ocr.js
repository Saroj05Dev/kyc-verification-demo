// helpers/ocr.js
const Tesseract = require("tesseract.js");

exports.extractText = async (imageUrl) => {
  const { data } = await Tesseract.recognize(imageUrl, "eng");
  return data.text;
};
