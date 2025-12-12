const axios = require("axios");

exports.extractTextOcrSpace = async (imageUrl) => {
  try {
    const formData = new URLSearchParams();
    formData.append("apikey", process.env.OCR_SPACE_KEY);
    formData.append("url", imageUrl);
    formData.append("OCREngine", 2); // better engine

    const res = await axios.post(
      "https://api.ocr.space/parse/image",
      formData,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (
      res.data &&
      res.data.ParsedResults &&
      res.data.ParsedResults.length > 0
    ) {
      return res.data.ParsedResults[0].ParsedText;
    }

    return "";
  } catch (err) {
    console.error("OCR.Space Error:", err.message);
    return "";
  }
};
