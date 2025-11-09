// backend/routes/upiRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// ✅ Update or insert UPI record
router.post("/update-upi", async (req, res) => {
  try {
    const { upiId, qrCode } = req.body;

    if (!upiId) {
      return res.status(400).json({ success: false, message: "Missing UPI ID" });
    }

    // Convert Base64 → Buffer (if QR image provided)
    const base64Data = qrCode?.replace(/^data:image\/\w+;base64,/, "") || null;
    const buffer = base64Data ? Buffer.from(base64Data, "base64") : null;

    // Check if record exists (since only 1 record in table)
    const check = await pool.query("SELECT * FROM upi_scanners LIMIT 1");

    if (check.rows.length > 0) {
      // ✅ Update existing record
      await pool.query(
        "UPDATE upi_scanners SET upi_id = $1, qr_code = $2, updated_at = NOW() WHERE id = $3",
        [upiId, buffer, check.rows[0].id]
      );
    } else {
      // ✅ Insert new record
      await pool.query(
        "INSERT INTO upi_scanners (upi_id, qr_code) VALUES ($1, $2)",
        [upiId, buffer]
      );
    }

    res.json({ success: true, message: "UPI data saved successfully!" });
  } catch (err) {
    console.error("Error updating UPI:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Get UPI data
router.get("/get-upi", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM upi_scanners LIMIT 1");
    if (result.rows.length === 0) {
      return res.json({ success: true, upiId: "", qrCode: null });
    }

    const row = result.rows[0];

    // Convert BYTEA (buffer) → Base64 string (for frontend <img>)
    const qrBase64 = row.qr_code
      ? `data:image/png;base64,${row.qr_code.toString("base64")}`
      : null;

    res.json({
      success: true,
      upiId: row.upi_id,
      qrCode: qrBase64,
    });
  } catch (err) {
    console.error("Error fetching UPI:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/upi-scanner", async (req, res) => {
  try {
    const result = await pool.query("SELECT upi_id, encode(qr_code, 'base64') AS qr_code FROM upi_scanners ORDER BY id DESC LIMIT 1");
    if (result.rows.length === 0) return res.status(404).json({ message: "No UPI record found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching UPI:", err.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


module.exports = router;
