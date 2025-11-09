// backend/controllers/otpController.js
const pool = require("../config/db");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// ---------------------------------------------
// SEND OTP
// ---------------------------------------------
exports.sendOtp = async (req, res) => {
  const { email, userData } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const cleanEmail = email.trim().toLowerCase();
  const phone = userData.phone_number;
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
  const referralCode = userData.referral_code; // ADD THIS LINE

  // ✅ Check referral code validity only (no increment yet)
if (referralCode) {
  const refUser = await pool.query(
    `SELECT id FROM sign_up WHERE reference_code = $1`,
    [referralCode]
  );
  if (refUser.rows.length === 0) {
    console.log(`🔴 Invalid referral code entered: ${referralCode}`);
    return res.status(400).json({ message: "Invalid referral code" });
  }
}



  try {
    // 🔍 Check if user already exists
    const checkUser = await pool.query(
      `SELECT id, verified FROM sign_up WHERE LOWER(email) = $1 OR phone_number = $2`,
      [cleanEmail, phone]
    );

    if (checkUser.rows.length > 0) {
      const existing = checkUser.rows[0];

      if (existing.verified) {
        return res.status(400).json({
          success: false,
          message: "Email or phone already registered & verified",
        });
      }

      // Update existing unverified user - ADD REFERRAL CODE TO UPDATE
      await pool.query(
        `UPDATE sign_up
         SET full_name = $1, dob = $2, country_code = $3, phone_number = $4, gender = $5, password = $6, otp = $7, otp_expiry = $8, under_ref = $9
         WHERE id = $10`, // ADD under_ref to update
        [
          userData.full_name,
          userData.dob,
          userData.country_code,
          userData.phone_number,
          userData.gender,
          userData.password,
          otp,
          otpExpiry,
          referralCode || null, // ADD referral code
          existing.id,
        ]
      );
    } else {
      // Create new unverified user - ADD REFERRAL CODE TO INSERT
      await pool.query(
        `INSERT INTO sign_up 
           (full_name, email, dob, country_code, phone_number, gender, password, otp, otp_expiry, verified, under_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10)`, // ADD $10 for under_ref
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
          referralCode || null, // ADD THIS - store referral code if provided
        ]
      );
    }

    // ✅ Send email via Resend
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
      console.error("Resend error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email",
        error: error.message,
      });
    }

    console.log("Email sent successfully:", data);
    res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error("Error sending OTP:", err.message);
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
  try {
    const { email, otp } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // 1️⃣ Check user exists with OTP
    const userResult = await pool.query(
      `SELECT * FROM sign_up WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Email not found" });
    }

    const user = userResult.rows[0];

    // 2️⃣ Validate OTP
    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (user.otp_expiry && new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // 3️⃣ Mark verified
    await pool.query(
      `UPDATE sign_up 
       SET verified = true, otp = NULL, otp_expiry = NULL, verified_at = NOW()
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    // 4️⃣ Fetch referral (if any)
    const underRef = user.under_ref && user.under_ref !== "null" && user.under_ref !== "undefined"
      ? user.under_ref.trim()
      : null;

    // 5️⃣ If referral exists, increment referrer's count
    if (underRef) {
      const refCheck = await pool.query(
        `SELECT id FROM sign_up WHERE reference_code = $1`,
        [underRef]
      );

      if (refCheck.rows.length > 0) {
        await pool.query(
          `UPDATE sign_up SET reference_count = reference_count + 1 WHERE reference_code = $1`,
          [underRef]
        );
        console.log(`🟢 Referral count incremented for referrer: ${underRef}`);
      } else {
        console.log(`⚠️ Invalid referral code (${underRef}), skipping increment`);
      }
    } else {
      console.log("ℹ️ No referral code — proceeding normally");
    }

    // 6️⃣ Generate reference_code if missing
    if (!user.reference_code) {
      await pool.query(
        `UPDATE sign_up 
         SET reference_code = 'REF' || id
         WHERE LOWER(email) = $1 AND reference_code IS NULL`,
        [cleanEmail]
      );
    }

    // 7️⃣ Return verified user
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
    console.error("❌ Error verifying OTP:", err.message);
    res.status(500).json({ success: false, message: "Server error during OTP verification" });
  }
};

