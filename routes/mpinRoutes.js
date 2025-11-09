const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const crypto = require("crypto");
const { Resend } = require("resend");

// ✅ Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// routes/mpinRoutes.js
router.post("/forgot-mpin", async (req, res) => {
  const { email } = req.body;

  console.log("📧 Forgot MPIN request for:", email);

  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  try {
    // ✅ FIXED: Check what columns exist in your sign_up table
    // First, let's see the table structure
    const users = await pool.query(
      "SELECT * FROM sign_up WHERE email = $1 LIMIT 1",
      [email]
    );

    console.log("👤 User query result:", users.rows);
    console.log("👤 Available columns:", users.rows.length > 0 ? Object.keys(users.rows[0]) : "No user found");

    if (users.rows.length === 0) {
      return res.json({ 
        success: false, 
        message: "No account found with this email" 
      });
    }

    const user = users.rows[0];
    
    // ✅ FIXED: Use available columns - adjust based on your actual table structure
    // Common column names: first_name, full_name, username, etc.
    const userName = user.first_name || user.full_name || user.username || "User";

    // Generate 6-digit reset token
    const resetToken = crypto.randomInt(100000, 999999).toString();
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    console.log("🔐 Generated token:", resetToken);

    // Store token in database
    await pool.query(
      "UPDATE sign_up SET mpin_reset_token = $1, mpin_reset_expiry = $2 WHERE email = $3",
      [resetToken, tokenExpiry, email]
    );

    console.log("💾 Token stored in database");

    // Test if Resend is configured
    console.log("📧 Resend API Key:", process.env.RESEND_API_KEY ? "Present" : "Missing");
    console.log("📧 From Email:", process.env.FROM_EMAIL);

    // Send email with Resend
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'support@knowo.world',
      to: email,
      subject: "MPIN Reset Request - Crypto MLM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007BFF;">MPIN Reset Request</h2>
          <p>Hello ${userName},</p>
          <p>You have requested to reset your MPIN. Use the following verification code:</p>
          <div style="background: #f4f4f4; padding: 15px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007BFF; margin: 0; font-size: 32px; letter-spacing: 5px;">${resetToken}</h1>
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Crypto MLM Team</p>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Resend Email Error:", error);
      return res.status(500).json({ success: false, message: "Failed to send email: " + error.message });
    }

    console.log("✅ Email sent successfully");

    // For development - return token in response
    res.json({
      success: true,
      message: "MPIN reset token sent to your email",
      development_token: resetToken
    });

  } catch (err) {
    console.error("💥 Forgot MPIN Error:", err);
    console.error("💥 Error stack:", err.stack);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

// 🔐 VERIFY MPIN RESET TOKEN
router.post("/verify-mpin-token", async (req, res) => {
  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ success: false, message: "Email and token required" });
  }

  try {
    const users = await pool.query(
      "SELECT mpin_reset_token, mpin_reset_expiry FROM sign_up WHERE email = $1",
      [email]
    );

    if (users.rows.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }

    const user = users.rows[0];

    // Check if token exists and is not expired
    if (!user.mpin_reset_token || new Date() > new Date(user.mpin_reset_expiry)) {
      return res.json({ success: false, message: "Invalid or expired token" });
    }

    // Verify token
    if (user.mpin_reset_token !== token) {
      return res.json({ success: false, message: "Invalid token" });
    }

    res.json({
      success: true,
      message: "Token verified successfully",
    });

  } catch (err) {
    console.error("Verify MPIN Token Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/by-email/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query(
      "SELECT * FROM sign_up WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Error fetching user by email:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// 🔐 RESET MPIN
router.post("/reset-mpin", async (req, res) => {
  const { email, token, newMpin } = req.body;

  if (!email || !token || !newMpin) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  if (newMpin.length !== 4) {
    return res.json({ success: false, message: "MPIN must be 4 digits" });
  }

  try {
    // First verify the token
    const users = await pool.query(
      "SELECT mpin_reset_token, mpin_reset_expiry FROM sign_up WHERE email = $1",
      [email]
    );

    if (users.rows.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }

    const user = users.rows[0];

    if (!user.mpin_reset_token || new Date() > new Date(user.mpin_reset_expiry)) {
      return res.json({ success: false, message: "Invalid or expired token" });
    }

    if (user.mpin_reset_token !== token) {
      return res.json({ success: false, message: "Invalid token" });
    }

    // Update MPIN and clear reset token
    await pool.query(
      "UPDATE sign_up SET mpin = $1, mpin_reset_token = NULL, mpin_reset_expiry = NULL WHERE email = $2",
      [newMpin, email]
    );

    res.json({
      success: true,
      message: "MPIN reset successfully",
    });

  } catch (err) {
    console.error("Reset MPIN Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;