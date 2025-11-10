// backend/controllers/otpController.js
const pool = require("../config/db");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// ---------------------------------------------
// Helper for timestamped logs
// ---------------------------------------------
const log = (type, msg, data = "") => {
  const time = new Date().toISOString();
  const color =
    type === "INFO" ? "\x1b[32m" :
    type === "WARN" ? "\x1b[33m" :
    type === "ERROR" ? "\x1b[31m" :
    "\x1b[36m";
  console.log(`${color}[${time}] [${type}] ${msg}`, data, "\x1b[0m");
};

// ---------------------------------------------
// SEND OTP
// ---------------------------------------------
exports.sendOtp = async (req, res) => {
  const { email, userData } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const cleanEmail = email.trim().toLowerCase();
  const phone = userData.phone_number;
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  let referralCode = userData.referral_code;

  log("INFO", `📩 OTP generation request for ${cleanEmail}`);

  try {
    // ✅ Check referral code validity only if provided
    if (referralCode && referralCode.trim() !== "") {
      const refUser = await pool.query(
        `SELECT id FROM sign_up WHERE reference_code = $1`,
        [referralCode]
      );
      if (refUser.rows.length === 0) {
        log("WARN", `🔴 Invalid referral code entered: ${referralCode}`);
        referralCode = null;
      } else {
        log("INFO", `🟢 Valid referral code used: ${referralCode}`);
      }
    } else {
      log("INFO", "No referral code provided.");
    }

    // 🔍 Check if user already exists
    const checkUser = await pool.query(
      `SELECT id, verified FROM sign_up WHERE LOWER(email) = $1 OR phone_number = $2`,
      [cleanEmail, phone]
    );

    if (checkUser.rows.length > 0) {
      const existing = checkUser.rows[0];
      if (existing.verified) {
        log("WARN", `User ${cleanEmail} already verified`);
        return res.status(400).json({
          success: false,
          message: "Email or phone already registered & verified",
        });
      }

      // Update existing unverified user
      await pool.query(
        `UPDATE sign_up
         SET full_name=$1, dob=$2, country_code=$3, phone_number=$4,
             gender=$5, password=$6, otp=$7, otp_expiry=$8, under_ref=$9
         WHERE id=$10`,
        [
          userData.full_name,
          userData.dob,
          userData.country_code,
          userData.phone_number,
          userData.gender,
          userData.password,
          otp,
          otpExpiry,
          referralCode || null,
          existing.id,
        ]
      );
      log("INFO", `🔁 Updated existing unverified user: ${cleanEmail}`);
    } else {
      // Create new unverified user
      await pool.query(
        `INSERT INTO sign_up 
           (full_name, email, dob, country_code, phone_number, gender, password, otp, otp_expiry, verified, under_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10)`,
        [
          userData.full_name,
          cleanEmail,
          userData.dob,
          userData.country_code,
          userData.phone_number,
          userData.gender,
          userData.password,
          otp,
          otpExpiry,
          referralCode || null,
        ]
      );
      log("INFO", `🆕 Created new unverified user: ${cleanEmail}`);
    }

    // ✅ Send OTP email via Resend
    const { data, error } = await resend.emails.send({
      from: "Knowo World <support@knowo.world>",
      to: email,
      subject: "Your OTP Code - Knowo World",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Knowo World</h2>
          <p>Your OTP code for verification is:</p>
          <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Knowo World Team</p>
        </div>
      `,
    });

    if (error) {
      log("ERROR", "❌ Failed to send OTP email", error);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email",
        error: error.message,
      });
    }

    log("INFO", `📧 OTP email sent successfully to ${cleanEmail}`);
    res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    log("ERROR", "Error sending OTP", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: err.message,
    });
  }
};

// ---------------------------------------------
// VERIFY OTP
// ---------------------------------------------
exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = email.trim().toLowerCase();

  log("INFO", `🔍 OTP verification attempt for ${cleanEmail}`);

  try {
    const result = await pool.query(
      `SELECT * FROM sign_up WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      log("WARN", `User not found: ${cleanEmail}`);
      return res.status(400).json({ success: false, message: "Email not found" });
    }

    const user = result.rows[0];

    // Check if OTP matches
    if (user.otp !== otp) {
      log("WARN", `❌ Invalid OTP for ${cleanEmail}`);
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Check expiry
    if (user.otp_expiry && new Date() > new Date(user.otp_expiry)) {
      log("WARN", `⏰ OTP expired for ${cleanEmail}`);
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // ✅ Mark verified
    await pool.query(
      `UPDATE sign_up 
       SET verified = true, otp = NULL, otp_expiry = NULL, verified_at = NOW()
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    log("INFO", `✅ OTP verified successfully for ${cleanEmail}`);

    // ✅ Increment referral count if any
    const refCheck = await pool.query(
      `SELECT under_ref FROM sign_up WHERE LOWER(email) = $1`,
      [cleanEmail]
    );
    if (refCheck.rows[0]?.under_ref) {
      const refCode = refCheck.rows[0].under_ref;
      await pool.query(
        `UPDATE sign_up SET reference_count = reference_count + 1 WHERE reference_code = $1`,
        [refCode]
      );
      log("INFO", `🎉 Referral count incremented for ${refCode}`);
    }

    // ✅ Auto-unverify after 1 hr if MPIN not set
    setTimeout(async () => {
      try {
        const checkUser = await pool.query(
          `SELECT mpin, verified FROM sign_up WHERE LOWER(email) = $1`,
          [cleanEmail]
        );
        if (checkUser.rows[0] && !checkUser.rows[0].mpin && checkUser.rows[0].verified) {
          await pool.query(`UPDATE sign_up SET verified = false WHERE LOWER(email) = $1`, [cleanEmail]);
          log("WARN", `⏳ Auto-unverified ${cleanEmail} (no MPIN set in 1 hr)`);
        }
      } catch (e) {
        log("ERROR", `Error auto-unverifying user ${cleanEmail}`, e.message);
      }
    }, 60 * 60 * 1000); // 1 hour

    const updatedUser = await pool.query(
      `SELECT id, full_name AS "fullName", email, reference_code AS "referenceCode", status
       FROM sign_up WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    res.json({
      success: true,
      message: "OTP verified and account activated",
      user: updatedUser.rows[0],
    });
  } catch (err) {
    log("ERROR", "Error verifying OTP", err.message);
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
};
