// controllers/kyc.controller.js
const { processKyc } = require("../services/kyc.service");

exports.submitKyc = async (req, res) => {
  try {
    const result = await processKyc({
      userId: req.body.userId,
      files: req.files,
      body: req.body,
    });

    return res.status(200).json({
      success: true,
      message: "KYC processed successfully.",
      data: {
        user: {
          id: result.userId,
          fullName: result.fullName,
        },
        kyc: result.kyc
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to process KYC.",
      error: err.message,
    });
  }
};
