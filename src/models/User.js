// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: String,

  kycStatus: {
    type: String,
    enum: ["not_submitted", "pending", "verified", "rejected"],
    default: "not_submitted",
  },

  aadhaarNumber: String,
  panNumber: String,

  documents: {
    aadhaarFront: String,
    pan: String,
  },

  extracted: {
    aadhaar: String,
    pan: String,
  },

  remarks: String,
});

module.exports = mongoose.model("User", userSchema);
