// services/kyc.service.js
const User = require("../models/User");
const { uploadToCloudinary } = require("../helpers/cloudinary");
const { extractText } = require("../helpers/ocr");

function extractAadhaar(text) {
  const match = text.replace(/\s/g, "").match(/\b\d{12}\b/);
  return match ? match[0] : null;
}

function extractPan(text) {
  const match = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/i);
  return match ? match[0].toUpperCase() : null;
}

exports.processKyc = async ({ userId, files, body }) => {
  const user = await User.findById(userId);

  user.kycStatus = "pending";
  await user.save();

  // 1. Upload images to Cloudinary
  const front = await uploadToCloudinary(files.aadhaarFront[0].path);
  const pan = await uploadToCloudinary(files.pan[0].path);

  user.documents = {
    aadhaarFront: front.secure_url,
    pan: pan.secure_url,
  };
  await user.save();

  // 2. OCR on both
  const aadhaarText = await extractText(front.secure_url);
  const panText = await extractText(pan.secure_url);

  // 3. Extract numbers
  const extractedAadhaar = extractAadhaar(aadhaarText);
  const extractedPan = extractPan(panText);

  user.extracted = {
    aadhaar: extractedAadhaar,
    pan: extractedPan,
  };

  // 4. Compare
  const aadhaarMatch = extractedAadhaar === body.aadhaarNumber;
  const panMatch = extractedPan === body.panNumber;

  if (aadhaarMatch && panMatch) {
    user.kycStatus = "verified";
    user.remarks = "Auto-verified successfully.";
  } else {
    user.kycStatus = "rejected";
    user.remarks = "Document mismatch.";
  }

  await user.save();

  return {
    userId: user._id,
    fullName: user.fullName,

    kyc: {
      status: user.kycStatus,
      remarks: user.remarks,

      submittedData: {
        aadhaar: body.aadhaarNumber,
        pan: body.panNumber,
      },

      extractedData: {
        aadhaar: extractedAadhaar,
        pan: extractedPan,
      },

      documentUrls: {
        aadhaarFront: user.documents.aadhaarFront,
        pan: user.documents.pan,
      },

      timestamps: {
        submittedAt: user.createdAt || new Date(),
        verifiedAt: new Date(),
      },
    },
  };
};
