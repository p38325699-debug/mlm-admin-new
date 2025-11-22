// backend/routes/walletRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const multer = require('multer');
const axios = require("axios");

// Configure multer for memory storage (for bytea)
const storage = multer.memoryStorage();
const sharp = require('sharp');
const Tesseract = require("tesseract.js");
const { createHash } = require('crypto');
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for files
    fieldSize: 10 * 1024 * 1024, // 🆕 CRUCIAL: 10MB for text fields like ocr_raw
  },
  fileFilter: (req, file, cb) => { 
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ✅ Extract text from image using OCR
const extractTextFromImage = async (imageBuffer) => {
  try {
    console.log("🔍 Starting OCR text extraction...");
    
    const processedImage = await sharp(imageBuffer)
      .resize(2000)
      .grayscale()
      .normalize()
      .toBuffer();

    const { data: { text } } = await Tesseract.recognize(
      processedImage,
      'eng',
      { logger: m => console.log(m) }
    );

    console.log("📝 Extracted OCR Text:", text);
    return text;
  } catch (error) {
    console.error("💥 OCR Extraction Error:", error);
    throw new Error("Failed to extract text from image");
  }
};
// /api/verify-upi
router.post("/verify-upi", async (req, res) => {
  try {
    const { ocrText, utr_number, amount: userEnteredAmount } = req.body; // 🟩 FIXED: Renamed parameter

    if (!ocrText) {
      return res.status(400).json({ 
        success: false, 
        message: "OCR text is required" 
      });
    }

    console.log("📄 Received OCR Text:", ocrText);
    console.log("🔢 Received UTR:", utr_number);
    console.log("💰 Received Amount:", userEnteredAmount);

    // ---------------------------------------
    // 1. FIX OCR garbled numbers (O, ?, o → 0)
    // ---------------------------------------
    let cleanedText = ocrText.replace(/[OQo?]/gi, "0");
    cleanedText = cleanedText.replace(/₹\s?/g, ""); // remove ₹ for easy scanning
    cleanedText = cleanedText.replace(/\$/g, ""); // remove $ symbols

    console.log("🧹 CLEANED OCR:", cleanedText);

    // ---------------------------------------
    // 2. Extract Amount (strong method)
    // ---------------------------------------
    let extractedAmount = null; // 🟩 FIXED: Different variable name

    // Match amounts with various formats
    const amountRegex = /\b(?:inr|rs|rs\.?|usd|\$)?\s?([\d,]+(?:\.\d{2})?)\b/i;
    const amountMatch = cleanedText.match(amountRegex);

    if (amountMatch) {
      extractedAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
    }

    console.log("📌 Extracted Amount:", extractedAmount);

    // If still not found, use fallback
    if (!extractedAmount) {
      const fallback = cleanedText.match(/\b\d{3,6}\b/);
      if (fallback) extractedAmount = parseInt(fallback[0]);
      console.log("📌 Fallback Amount:", extractedAmount);
    }

    // ---------------------------------------
    // 3. Extract UPI Transaction ID (10–18 digits)
    // ---------------------------------------
    let extractedUtr = null;
    const upiRegex = /\b\d{10,18}\b/g;
    const candidateIds = cleanedText.match(upiRegex) || [];

    console.log("📌 UPI Candidates:", candidateIds);

    // Priority 1: Match with provided UTR
    if (utr_number && candidateIds.includes(utr_number)) {
      extractedUtr = utr_number;
    }
    // Priority 2: Find number near "UPI" keyword
    else if (cleanedText.includes("UPI")) {
      const upiIndex = cleanedText.indexOf("UPI");
      for (let id of candidateIds) {
        if (cleanedText.indexOf(id) > upiIndex) {
          extractedUtr = id;
          break;
        }
      }
    }
    // Priority 3: Use longest candidate
    else if (candidateIds.length > 0) {
      extractedUtr = candidateIds.sort((a, b) => b.length - a.length)[0];
    }

    console.log("📌 Selected UTR:", extractedUtr);

    // ---------------------------------------
    // 4. Validation & Response
    // ---------------------------------------
    if (!extractedAmount) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Unable to detect payment amount in screenshot",
        reason: "Amount not found"
      });
    }

    if (!extractedUtr) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Unable to detect UTR in screenshot", 
        reason: "Transaction ID not found"
      });
    }

    // Cross-check with user input
    const amountMatches = Math.abs(extractedAmount - parseFloat(userEnteredAmount)) <= 10;
    const utrMatches = extractedUtr === utr_number;

    if (!amountMatches || !utrMatches) {
      return res.json({
        success: true,
        valid: true, // Still valid but with warnings
        message: "Payment details found with discrepancies",
        data: {
          amount: extractedAmount,
          upiTxnId: extractedUtr
        },
        warnings: [
          !amountMatches && `Amount in screenshot (${extractedAmount}) differs from entered amount (${userEnteredAmount})`,
          !utrMatches && `UTR in screenshot (${extractedUtr}) differs from entered UTR (${utr_number})`
        ].filter(Boolean)
      });
    }

    // ---------------------------------------
    // 5. Success Response
    // ---------------------------------------
    return res.json({
      success: true,
      valid: true,
      message: "Payment verified successfully",
      data: {
        amount: extractedAmount,
        upiTxnId: extractedUtr
      }
    });

  } catch (error) {
    console.error("💥 VERIFY UPI ERROR:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error during verification" 
    });
  }
});

// ✅ Get screenshot by wallet ID
router.get("/wallet/:id/screenshot", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT screenshot FROM wallet WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].screenshot) {
      return res.status(404).json({ success: false, message: "Screenshot not found" });
    }

    const screenshot = result.rows[0].screenshot;
    
    // Set appropriate headers for image response
    res.setHeader("Content-Type", "image/*"); // Adjust based on your image type
    res.setHeader('Content-Length', screenshot.length);
    res.send(screenshot);
  } catch (err) {
    console.error("💥 Get Screenshot Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ TEST ENDPOINT: Extract UTR and Amount from image only
router.post("/test-image-extraction", upload.single('screenshot'), async (req, res) => {
  try {
    console.log("🧪 TEST: Image extraction request received");

    const screenshot = req.file ? req.file.buffer : null;
    if (!screenshot) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    // Step 1: Extract text from image using OCR
    const ocrText = await extractTextFromImage(screenshot);
    if (!ocrText || ocrText.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Could not read any text from the image" });
    }

    console.log("📝 EXTRACTED OCR TEXT:", ocrText);

    // Step 2: Extract Amount (ignore timestamps, small numbers)
    let extractedAmount = null;
    const lines = ocrText.split('\n');

    for (let line of lines) {
      // Only consider lines containing currency symbols or keywords
      if (/₹|INR|Amount|Paid/i.test(line)) {
        const match = line.match(/(\d{2,6}(?:,\d{3})*(?:\.\d{2})?)/);
        if (match) {
          const amountNum = parseFloat(match[1].replace(/,/g, ''));
          if (amountNum >= 10 && amountNum <= 100000) {
            extractedAmount = amountNum;
            break;
          }
        }
      }
    }

    // Step 3: Extract UTR (prefer near 'UTR' or 'Transaction ID')
    let extractedUtr = null;
    const utrRegex = /\b\d{10,18}\b/g;
    const candidateIds = ocrText.match(utrRegex) || [];

    const validUtrs = candidateIds.filter(id => {
      // Exclude 10-digit phone numbers or short numbers
      return !(id.match(/^\d{10}$/) || id.match(/^\d{6,8}$/));
    });

    // Prefer UTR that appears near the keyword "UTR" or "Transaction ID"
    for (let line of lines) {
      if (/UTR|Transaction ID/i.test(line)) {
        const match = line.match(/\d{10,18}/);
        if (match) {
          extractedUtr = match[0];
          break;
        }
      }
    }

    // Fallback: pick the longest valid number
    if (!extractedUtr && validUtrs.length > 0) {
      extractedUtr = validUtrs.sort((a, b) => b.length - a.length)[0];
    }

    // Step 4: Respond with extracted data (always send success)
    res.json({
      success: true,
      message: "Image processed successfully",
      extracted_data: {
        amount: extractedAmount || null,
        utr: extractedUtr || null,
        ocr_raw: ocrText,
        candidate_utrs: candidateIds,
        filtered_utrs: validUtrs
      },
      debug: {
        amount_found: extractedAmount ? "Yes" : "No",
        utr_candidates_found: candidateIds.length,
        valid_utrs_found: validUtrs.length
      }
    });

  } catch (error) {
    console.error("💥 TEST Image Extraction Error:", error);
    res.status(500).json({
      success: false,
      message: "Image processing failed",
      error: error.message
    });
  }
});

router.post("/wallet-topup", upload.single("screenshot"), async (req, res) => {
  try {
    console.log("🔥 Received Wallet Topup Request");

    const { utr_number, amount, method, user_id, img_hash, ocr_raw } = req.body;

    if (!req.file) {
      return res.json({
        success: false,
        message: "Screenshot image missing!",
      });
    }

    const screenshotBuffer = req.file.buffer; // raw image bytes

    const insertQuery = `
      INSERT INTO wallet 
      (user_id, amount, method, utr_number, screenshot, img_hash, ocr_raw, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      user_id,
      amount,
      method,
      utr_number,
      screenshotBuffer,
      img_hash,
      ocr_raw
    ]);

    return res.json({
      success: true,
      message: "Wallet top-up submitted successfully!",
      data: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Wallet Topup Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

// Add these enhanced functions after your existing imports

// ✅ Generate image hash function (like UTR matching)
const generateImageHash = (imageBuffer) => {
  return createHash('md5').update(imageBuffer).digest('hex');
};

// ✅ Enhanced wallet top-up with UTR + Image Hash verification
router.post("/wallet-topup-enhanced", upload.single("screenshot"), async (req, res) => {
  try {
    console.log("🔥 Enhanced Wallet Topup Request Received");

    const { utr_number, amount, method, user_id } = req.body;

    // Validation
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Payment screenshot is required!",
      });
    }

    if (!utr_number || !amount || !user_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: UTR, Amount, or User ID",
      });
    }

    const screenshotBuffer = req.file.buffer;

    // ✅ Step 1: Generate image hash (like UTR matching logic)
    const img_hash = generateImageHash(screenshotBuffer);
    console.log("🔑 Generated Image Hash:", img_hash);

    // ✅ Step 2: Check for duplicate UTR (existing logic)
    const utrCheck = await pool.query(
      "SELECT id, status FROM wallet WHERE utr_number = $1",
      [utr_number.trim()]
    );

    if (utrCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This UTR/Transaction ID has already been used!",
        existing_status: utrCheck.rows[0].status
      });
    }

    // ✅ Step 3: Check for duplicate image hash (NEW - like UTR matching)
    const imageHashCheck = await pool.query(
      "SELECT id, utr_number, status FROM wallet WHERE img_hash = $1 AND user_id = $2",
      [img_hash, user_id]
    );

    if (imageHashCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This payment screenshot has already been submitted!",
        duplicate_data: {
          existing_utr: imageHashCheck.rows[0].utr_number,
          status: imageHashCheck.rows[0].status
        }
      });
    }

    // ✅ Step 4: Extract OCR text for verification
    let ocr_raw = "";
    try {
      ocr_raw = await extractTextFromImage(screenshotBuffer);
      console.log("📝 Extracted OCR Text Length:", ocr_raw.length);
    } catch (ocrError) {
      console.warn("⚠️ OCR extraction failed, but continuing:", ocrError.message);
      ocr_raw = "OCR extraction failed";
    }

    // ✅ Step 5: Store everything including hash (like UTR storage)
    const result = await pool.query(
      `INSERT INTO wallet 
       (user_id, amount, method, utr_number, screenshot, img_hash, ocr_raw, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, user_id, amount, method, utr_number, status, payment_date`,
      [user_id, amount, method, utr_number, screenshotBuffer, img_hash, ocr_raw]
    );

    console.log("✅ Enhanced Wallet Topup Successful - ID:", result.rows[0].id);

    return res.json({
      success: true,
      message: "Payment submitted successfully with duplicate protection!",
      data: result.rows[0],
      verification: {
        utr_checked: true,
        image_hash_checked: true,
        duplicate_protection: "active"
      }
    });

  } catch (error) {
    console.error("❌ Enhanced Wallet Topup Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error during enhanced verification",
      error: error.message
    });
  }
});

// ✅ Check image hash duplicate (like UTR check)
router.get("/check-image-duplicate/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;
    const { image_hash } = req.query;

    if (!image_hash) {
      return res.status(400).json({
        success: false,
        message: "Image hash is required"
      });
    }

    const result = await pool.query(
      "SELECT id, utr_number, status, payment_date FROM wallet WHERE img_hash = $1 AND user_id = $2",
      [image_hash, user_id]
    );

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        isDuplicate: true,
        message: "This image has already been submitted",
        existing_record: result.rows[0]
      });
    }

    res.json({
      success: true,
      isDuplicate: false,
      message: "Image is unique and can be submitted"
    });

  } catch (err) {
    console.error("💥 Check Image Duplicate Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ✅ Check if UTR number already exists
router.get("/check-utr/:utr_number", async (req, res) => {
  try {
    const { utr_number } = req.params;
    
    const result = await pool.query(
      "SELECT id, status FROM wallet WHERE utr_number = $1",
      [utr_number.trim()]
    );

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        exists: true,
        status: result.rows[0].status,
        message: "This UTR/Transaction ID has already been used"
      });
    }

    res.json({
      success: true,
      exists: false,
      message: "UTR number is available"
    });
  } catch (err) {
    console.error("💥 Check UTR Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Admin updates wallet due → auto notification and coin update
router.put("/wallet-due/:id", async (req, res) => {
  try {
    const walletId = req.params.id;
    const { due } = req.body;

    // 🧠 Update wallet due + status
const result = await pool.query(
  `UPDATE wallet 
   SET due = $1, 
       status = CASE WHEN $1 = true THEN 'completed' ELSE status END 
   WHERE id = $2 
   RETURNING user_id, amount`,
  [due, walletId]
);


    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Wallet record not found" });
    }

    const { user_id, amount } = result.rows[0];

    if (due === true) {
      // 🟢 Add to user balance
      await pool.query("UPDATE sign_up SET coin = coin + $1 WHERE id = $2", [amount, user_id]);

      // 🟢 Notify user
      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `Wallet top-up of $${amount} has been approved.`]
      );
    }

    res.json({ success: true, message: "Wallet due status updated successfully" });
  } catch (err) {
    console.error("💥 Wallet Due Update Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Fetch all wallet records (Admin side)
router.get("/wallet/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.*, 
        s.full_name, 
        s.email
      FROM wallet w
      JOIN sign_up s ON w.user_id = s.id
      ORDER BY w.payment_date DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("💥 Fetch All Wallet Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ✅ Fetch wallet records for specific user
// router.get("/wallet/user/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const result = await pool.query(
//       `SELECT * FROM wallet WHERE user_id = $1 ORDER BY payment_date DESC`,
//       [userId]
//     );

//     if (result.rows.length === 0) {
//       return res.json({ success: true, data: [], message: "No wallet records found" });
//     }

//     res.json({ success: true, data: result.rows });
//   } catch (err) {
//     console.error("💥 Fetch Wallet by User Error:", err.message);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// ✅ Fetch wallet records for specific user (INCLUDE BOTH WALLET & CRYPTO PAYMENTS)
router.get("/wallet/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get regular wallet transactions
    const walletResult = await pool.query(
      `SELECT 
        id, user_id, amount, method, utr_number, due, status, 
        payment_date as created_at, 'wallet' as type, NULL as payment_status,
        NULL as currency, NULL as network, NULL as tx_hash, NULL as order_id
       FROM wallet 
       WHERE user_id = $1`,
      [userId]
    );

    // Get crypto payments - FIX: Use payment_status as status for consistency
    const cryptoResult = await pool.query(
      `SELECT 
        id, user_id, amount, 'CRYPTO' as method, NULL as utr_number,
        NULL as due, payment_status as status, created_at,
        'crypto_payment' as type, payment_status,
        currency, network, tx_hash, order_id
       FROM crypto_payments 
       WHERE user_id = $1`,
      [userId]
    );

    // Combine both results
    const combinedData = [
      ...walletResult.rows,
      ...cryptoResult.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (combinedData.length === 0) {
      return res.json({ success: true, data: [], message: "No wallet records found" });
    }

    res.json({ success: true, data: combinedData });
  } catch (err) {
    console.error("💥 Fetch Wallet by User Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/wallet-withdrawal
router.post("/wallet-withdrawal", async (req, res) => {
  try {
    const {
  user_id,
  amount,
  message,
  method,
  upi_address,
  bank_holder_name,
  bank_name,
  ifsc_code,
  crypto_address,
  crypto_network
} = req.body;


    if (!user_id || !amount) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (amount < 50) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is $50" });
    }

   const result = await pool.query(
  `INSERT INTO wallet_withdrawals 
   (user_id, amount, message, method, upi_address, bank_holder_name, bank_name, ifsc_code, crypto_address, crypto_network)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   RETURNING *`,
  [user_id, amount, message || null, method || 'UPI', upi_address || null, bank_holder_name || null,
   bank_name || null, ifsc_code || null, crypto_address || null, crypto_network || 'BEP20']
);


    res.json({ success: true, data: result.rows[0], message: "Withdrawal request submitted successfully" });
  } catch (err) {
    console.error("💥 Wallet Withdrawal Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ✅ Get current wallet balance
router.get("/user/:userId/balance", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      "SELECT coin FROM sign_up WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, balance: result.rows[0].coin });
  } catch (err) {
    console.error("💥 Fetch Wallet Balance Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/wallet-withdrawals/:userId
router.get("/wallet-withdrawals/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT * FROM wallet_withdrawals WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("💥 Fetch Withdrawals Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Admin: Fetch all withdrawal requests (UPI / Bank / Crypto)
router.get("/withdrawals/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.id,
        w.user_id,
        s.full_name,
        s.email,
        w.amount,
        w.message,
        w.method,
        w.status,
        w.created_at,

        -- Optional fields depending on method
        w.upi_address,
        w.bank_holder_name,
        w.bank_name,
        w.ifsc_code,
        w.crypto_address,
        w.crypto_network

      FROM wallet_withdrawals w
      JOIN sign_up s ON w.user_id = s.id
      ORDER BY w.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("💥 Fetch All Withdrawals Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Check if user has pending withdrawal
router.get("/withdrawals/check-pending/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      "SELECT COUNT(*) as pending_count FROM wallet_withdrawals WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );

    const hasPending = parseInt(result.rows[0].pending_count) > 0;
    
    res.json({ 
      success: true, 
      hasPending: hasPending,
      pendingCount: parseInt(result.rows[0].pending_count)
    });
  } catch (err) {
    console.error("💥 Check Pending Withdrawals Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Admin: Update withdrawal status
router.put("/withdrawals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // ✅ Validate status value
    if (!["pending", "completed", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    // ✅ Fetch withdrawal details
    const withdrawalRes = await pool.query(
      "SELECT user_id, amount, status FROM wallet_withdrawals WHERE id = $1",
      [id]
    );

    if (withdrawalRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }

    const { user_id, amount, status: currentStatus } = withdrawalRes.rows[0];

    // ✅ Prevent double processing
    if (currentStatus === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "This withdrawal is already marked as completed." });
    }

    // ✅ Update withdrawal status
    await pool.query("UPDATE wallet_withdrawals SET status = $1 WHERE id = $2", [status, id]);

    if (status === "completed") {
      // 🟢 Deduct amount from user's wallet
      await pool.query("UPDATE sign_up SET coin = coin - $1 WHERE id = $2", [amount, user_id]);

      // 🟢 Insert notification
      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `${amount} amount has been sent successfully for withdrawal.`]
      );
    }

    if (status === "rejected") {
      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `Your withdrawal request of ${amount} was rejected.`]
      );
    }

    res.json({ success: true, message: "Withdrawal status updated successfully." });
  } catch (err) {
    console.error("💥 Withdrawal Update Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
