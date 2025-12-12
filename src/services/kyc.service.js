// services/kyc.service.js
const User = require("../models/User");
const { uploadToCloudinary } = require("../helpers/cloudinary");
const { extractTextOcrSpace } = require("../helpers/ocrSpace");

// -------------------------------------------------------------
// VERHOEFF CHECKSUM for Aadhaar Validation
// -------------------------------------------------------------
// robust extractAadhaar (replace existing extractAadhaar)
function verhoeffValidate(numStr) {
  const d = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,2,3,4,0,6,7,8,9,5],
    [2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],
    [7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
  ];
  const p = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,5,7,6,2,8,3,0,9,4],
    [5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],
    [4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],
    [7,0,4,6,9,1,3,2,5,8]
  ];
  let c = 0;
  const arr = numStr.split("").reverse().map(ch => parseInt(ch,10));
  for (let i=0;i<arr.length;i++){
    c = d[c][ p[i % 8][ arr[i] ] ];
  }
  return c === 0;
}

/**
 * Improved Aadhaar extraction:
 * - Finds candidate substrings that contain digit-like groups and separators
 * - Applies conservative char->digit fixes only inside those substrings
 * - Builds 12-digit candidates from groups (prefer 4+4+4 patterns)
 * - Validates candidates with Verhoeff
 */
function extractAadhaar(rawText, { debug = false } = {}) {
  if (!rawText || typeof rawText !== "string") return null;

  // normalize line endings and replace NBSP
  let text = rawText.replace(/\u00A0/g, " ").replace(/\r/g, "\n");

  if (debug) console.log("RAW OCR TEXT:", text.slice(0, 1000)); // sample

  // 1) Find substrings that contain at least 2 digit groups (likely the ID area)
  //    We'll search for parts that include digits and common separators up to length 60 characters.
  const substrPattern = /[0-9OIlSBDQ\-\.\s]{8,60}/g; // include letters commonly confused with digits
  const matches = Array.from(text.matchAll(substrPattern)).map(m => m[0]);

  // fallback: if no matches found, take the full text as single candidate
  if (matches.length === 0) matches.push(text);

  const candidatesChecked = [];
  for (const chunk of matches) {
    // Conservative per-character corrections, only for confusing chars
    const corrections = { O: "0", o: "0", I: "1", l: "1", Z: "2", S: "5", s: "5", B: "8", Q: "0", D: "0" };

    let corrected = "";
    for (const ch of chunk) {
      if (/[A-Za-z]/.test(ch) && corrections[ch]) corrected += corrections[ch];
      else corrected += ch;
    }

    // Extract numeric groups (preserve group boundaries)
    const groups = corrected.split(/[^0-9]+/).filter(Boolean); // e.g. ["7615","7499","0539"]

    if (debug) console.log("CHUNK:", chunk, "=> groups:", groups);

    // quick check: any single group of length 12?
    for (const g of groups) {
      if (g.length === 12) {
        candidatesChecked.push(g);
        if (verhoeffValidate(g)) {
          if (debug) console.log("VALID AADHAAR found (single group):", g);
          return g;
        }
      }
    }

    // Prefer concatenating groups that produce 12 digits (1..4 groups)
    // Try to form candidates by concatenating up to 4 adjacent groups
    for (let i = 0; i < groups.length; i++) {
      let acc = groups[i];
      if (acc.length > 12) {
        // windows inside long group
        for (let s = 0; s + 12 <= acc.length; s++) {
          const sub = acc.substr(s, 12);
          candidatesChecked.push(sub);
          if (verhoeffValidate(sub)) {
            if (debug) console.log("VALID AADHAAR found (subwindow):", sub);
            return sub;
          }
        }
      }
      for (let j = i + 1; j < Math.min(groups.length, i + 4); j++) {
        acc += groups[j];
        if (acc.length === 12) {
          candidatesChecked.push(acc);
          if (verhoeffValidate(acc)) {
            if (debug) console.log("VALID AADHAAR found (concat):", acc);
            return acc;
          }
        } else if (acc.length > 12) {
          for (let s = 0; s + 12 <= acc.length; s++) {
            const sub = acc.substr(s, 12);
            candidatesChecked.push(sub);
            if (verhoeffValidate(sub)) {
              if (debug) console.log("VALID AADHAAR found (concat window):", sub);
              return sub;
            }
          }
        }
      }
    }
  }

  // 2) Last-resort: scan entire text for any 12-digit substring (most aggressive)
  const digitOnly = text.replace(/[^0-9]/g, "");
  for (let s = 0; s + 12 <= digitOnly.length; s++) {
    const sub = digitOnly.substr(s, 12);
    candidatesChecked.push(sub);
    if (verhoeffValidate(sub)) {
      if (debug) console.log("VALID AADHAAR found (global window):", sub);
      return sub;
    }
  }

  if (debug) {
    console.log("Aadhaar candidates checked:", candidatesChecked.slice(0,50));
    console.log("No valid Aadhaar found.");
  }

  return null;
}


// -------------------------------------------------------------
// PAN Extraction
// -------------------------------------------------------------
function extractPan(text) {
  const match = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/i);
  return match ? match[0].toUpperCase() : null;
}

// -------------------------------------------------------------
// Smart Name Extraction
// -------------------------------------------------------------
function extractNameFromText(text) {
  const forbidden = ["GOVERNMENT", "INCOME", "TAX", "PERMANENT", "ACCOUNT", "NUMBER", "CARD", "DEPARTMENT"];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && /^[A-Za-z\s]+$/.test(l));

  const filtered = lines.filter((l) => !forbidden.some((f) => l.toUpperCase().includes(f)));

  const likelyNames = filtered.filter((l) => {
    const parts = l.split(" ");
    return parts.length >= 2 && parts.length <= 4;
  });

  if (likelyNames.length > 0) return likelyNames[0].toUpperCase();
  if (filtered.length >= 2) return filtered[1].toUpperCase();
  if (filtered.length >= 1) return filtered[0].toUpperCase();

  return "";
}

// Normalize & fuzzy match
function normalize(str = "") { return str.replace(/\s+/g, "").toUpperCase(); }
function fuzzyMatch(a, b) {
  const x = a.toUpperCase().split(" ");
  const y = b.toUpperCase().split(" ");

  const firstA = x[0];
  const firstB = y[0];
  if (firstA !== firstB) return false; // first name mismatch

  // if submitted is shorter, allow match (missing surname)
  if (x.length < y.length) {
    // ensure all submitted tokens exist in extracted
    return x.every(token => y.includes(token));
  }

  // submitted has extra words → reject
  return x.length === y.length;
}


// -------------------------------------------------------------
// MAIN KYC SERVICE
// -------------------------------------------------------------
exports.processKyc = async ({ userId, files, body }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  user.kycStatus = "pending";
  await user.save();

  // 1. Upload to Cloudinary
  const front = await uploadToCloudinary(files.aadhaarFront[0].path);
  const pan = await uploadToCloudinary(files.pan[0].path);

  user.documents = { aadhaarFront: front.secure_url, pan: pan.secure_url };
  await user.save();

  // 2. OCR using OCR.Space
  const aadhaarText = await extractTextOcrSpace(front.secure_url);
  const panText = await extractTextOcrSpace(pan.secure_url);

  console.log("OCR Aadhaar:", aadhaarText);
  console.log("OCR PAN:", panText);

  // 3. Extract fields
  const extractedAadhaar = extractAadhaar(aadhaarText);
  const extractedPan = extractPan(panText);

  const nameA = extractNameFromText(aadhaarText);
  const nameP = extractNameFromText(panText);
  const extractedName = nameP || nameA;

  user.extracted = { aadhaar: extractedAadhaar, pan: extractedPan, fullName: extractedName };

  // 4. Compare
  const aadhaarMatch = extractedAadhaar === body.aadhaarNumber;
  const panMatch = extractedPan === body.panNumber;
  const nameMatch = fuzzyMatch(body.fullName, extractedName);

  let remarks = [];
  if (!aadhaarMatch) remarks.push("Aadhaar number mismatch.");
  if (!panMatch) remarks.push("PAN number mismatch.");
  if (!nameMatch) remarks.push("Name mismatch.");

  if (aadhaarMatch && panMatch && nameMatch) {
    user.kycStatus = "verified";
    user.remarks = "Auto-verified successfully.";
  } else {
    user.kycStatus = "rejected";
    user.remarks = remarks.join(" ");
  }

  await user.save();

  // 5. Response
  return {
    userId: user._id,
    fullName: user.fullName,
    kyc: {
      status: user.kycStatus,
      remarks: user.remarks,
      submittedData: {
        aadhaar: body.aadhaarNumber,
        pan: body.panNumber,
        fullName: body.fullName,
      },
      extractedData: {
        aadhaar: extractedAadhaar,
        pan: extractedPan,
        fullName: extractedName,
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
