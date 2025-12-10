// src/app.js
const express = require("express");
const cors = require("cors");
const kycRoutes = require("./routes/kyc.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test route
app.get("/", (req, res) => {
  res.send("KYC Verifier Backend Running 🚀");
});

// KYC Routes
app.use("/kyc", kycRoutes);

module.exports = app;
