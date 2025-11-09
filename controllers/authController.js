// backend/controllers/authController.js
const pool = require("../config/db");
const crypto = require('crypto');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

exports.loginUser = async (req, res) => {
  console.log("Login request received:", req.body);
  const { email, password } = req.body;

  if (!email || !password || email.trim() === "" || password.trim() === "") {
    return res.status(400).json({ success: false, message: "Please provide email and password" });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT 
         id,
         email,
         password,
         verified,
         status,
         pause_start AS "pauseStart",
         full_name AS "fullName",
         reference_code AS "referenceCode",
         under_ref AS "underRef",          
     reference_count AS "referenceCount"
       FROM sign_up 
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "Email is not registered yet" });
    }

    const user = result.rows[0];

    // ✅ Password check (plain for now; replace with bcrypt.compare if hashed)
    if (user.password !== password.trim()) {
      return res.status(400).json({ success: false, message: "Invalid password" });
    }

    // ✅ Verified check
    if (!user.verified) {
      return res.status(400).json({ success: false, message: "Email is not verified yet" });
    }

    // ✅ Block check
    if (user.status === "block") {
      return res.status(403).json({ success: false, message: "Your account has been blocked by admin." });
    }

    // ✅ Pause check
    if (user.status === "pause") {
      const now = new Date();
      const pauseStart = user.pauseStart ? new Date(user.pauseStart) : null;

      if (pauseStart) {
        const pauseDuration = now - pauseStart;
        const daysPaused = Math.floor(pauseDuration / (1000 * 60 * 60 * 24));

        if (daysPaused < 30) {
          const daysLeft = 30 - daysPaused;
          return res.status(403).json({
            success: false,
            message: `Your account is paused. Try again in ${daysLeft} days.`
          });
        } else {
          // Auto-reactivate
          await pool.query(
            `UPDATE sign_up SET status = 'ok', pause_start = NULL WHERE id = $1`,
            [user.id]
          );
          user.status = "ok";
          user.pauseStart = null;
        }
      }
    }

    // Don’t send back password in response
    delete user.password;

    res.json({
      success: true,
      message: "Login successful",
      user
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Forgot Password - Send Reset Link
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || email.trim() === "") {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user exists
    const result = await pool.query(
      `SELECT id, email, full_name FROM sign_up WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Save token to database
    await pool.query(
      `UPDATE sign_up SET 
        reset_token = $1, 
        reset_token_expiry = $2 
       WHERE id = $3`,
      [resetToken, resetTokenExpiry, user.id]
    );

    // Create reset link (for mobile app - you'll need to handle deep linking)
    const resetLink = `knowo://reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: 'Password Reset Request - Knowo World',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007BFF;">Password Reset Request</h2>
          <p>Hello ${user.full_name || 'User'},</p>
          <p>You requested to reset your password for your Knowo World account.</p>
          <p>Please use the following reset token in the app:</p>
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="text-align: center; margin: 0; color: #333;">Reset Token:</h3>
            <p style="text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 10px 0;">${resetToken}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            This token will expire in 1 hour. If you didn't request this, please ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            Knowo World Team<br>
            Support: ${process.env.FROM_EMAIL}
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Email sending error:', error);
      return res.status(500).json({ success: false, message: "Failed to send reset email" });
    }

    res.json({
      success: true,
      message: "Password reset instructions sent to your email"
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Verify Reset Token
exports.verifyResetToken = async (req, res) => {
  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json({ success: false, message: "Token and email are required" });
    }

    const result = await pool.query(
      `SELECT id, reset_token_expiry FROM sign_up 
       WHERE reset_token = $1 AND LOWER(email) = $2`,
      [token, email.toLowerCase()]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    const user = result.rows[0];
    const now = new Date();

    if (now > user.reset_token_expiry) {
      return res.status(400).json({ success: false, message: "Reset token has expired" });
    }

    res.json({ success: true, message: "Token is valid" });

  } catch (err) {
    console.error("Verify token error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify token and get user
    const result = await pool.query(
      `SELECT id, reset_token_expiry FROM sign_up 
       WHERE reset_token = $1 AND LOWER(email) = $2`,
      [token, cleanEmail]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    const user = result.rows[0];
    const now = new Date();

    if (now > user.reset_token_expiry) {
      return res.status(400).json({ success: false, message: "Reset token has expired" });
    }

    // Update password and clear reset token
    await pool.query(
      `UPDATE sign_up SET 
        password = $1,
        reset_token = NULL,
        reset_token_expiry = NULL
       WHERE id = $2`,
      [newPassword.trim(), user.id] // For now storing plain text, consider bcrypt later
    );

    res.json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};