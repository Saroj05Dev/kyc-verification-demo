// routes/kyc.routes.js
const express = require("express");
const multer = require("multer");
const { submitKyc } = require("../controllers/kyc.controller");

const upload = multer({ dest: "uploads/" });

const router = express.Router();

router.post(
  "/submit",
  upload.fields([
    { name: "aadhaarFront", maxCount: 1 },
    { name: "pan", maxCount: 1 },
  ]),
  submitKyc
);

module.exports = router;
