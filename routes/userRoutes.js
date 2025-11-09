// backend/routes/userRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const pool = require("../config/db");
// Store files in memory, not on disk
const storage = multer.memoryStorage();
// const upload = multer({ storage });
const upload = multer({ storage: multer.memoryStorage() }); // store in memory
// const nodemailer = require("nodemailer");
const { Resend } = require("resend"); // ✅ ADD THIS LINE
const resend = new Resend(process.env.RESEND_API_KEY);
const { getUserDetails } = require("../controllers/userController");

// ✅ Test route
router.get("/", (req, res) => {
  res.json({ success: true, message: "User routes are working 🚀" });
});


// ✅ Get all users
router.get("/all-users", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM sign_up ORDER BY id ASC`
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Get single user profile - UPDATED to properly convert bytea to base64
// ✅ Get single user profile - FIXED base64 conversion
router.get("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
  `SELECT id, full_name, email, phone_number, dob, reference_code, gender,
   country_code, verified, created_at, status, coin, balance,
   business_plan, under_ref, profile_image, profile_image_type,
   first_plan_date, day_count, payment_status, trust
   FROM sign_up 
   WHERE id = $1`,
  [id]
);


    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];
    
    console.log("🔍 Profile query - Has image:", !!user.profile_image, "Type:", user.profile_image_type);
    
    // Convert bytea to base64 data URL if image exists
    if (user.profile_image && user.profile_image.length > 0) {
      try {
        // Ensure we're working with a Buffer
        const imageBuffer = Buffer.isBuffer(user.profile_image) 
          ? user.profile_image 
          : Buffer.from(user.profile_image);
        
        const base64String = imageBuffer.toString('base64');
        
        // Validate base64 string
        if (!base64String || base64String.length === 0) {
          console.error("❌ Empty base64 string generated");
          user.profile_image = null;
        } else {
          user.profile_image = `data:${user.profile_image_type || 'image/jpeg'};base64,${base64String}`;
          console.log("✅ Converted bytea to base64 URL, length:", user.profile_image.length);
          console.log("🔍 Base64 preview:", base64String.substring(0, 50) + "...");
        }
      } catch (convertError) {
        console.error("❌ Error converting image to base64:", convertError);
        user.profile_image = null;
      }
    } else {
      console.log("ℹ️ No profile image found for user");
      user.profile_image = null;
    }

    res.json({ 
      success: true, 
      user,
      debug: {
        has_image: !!user.profile_image,
        image_type: user.profile_image_type,
        image_size: user.profile_image ? user.profile_image.length : 0
      }
    });
  } catch (error) {
    console.error("❌ Error fetching user profile:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Update trust column
router.put("/:id/trust", async (req, res) => {
  const { id } = req.params;
  const { trust } = req.body; // true / false

  if (typeof trust !== "boolean") {
    return res.status(400).json({ success: false, message: "Invalid trust value" });
  }

  try {
    const result = await pool.query(
      "UPDATE sign_up SET trust = $1 WHERE id = $2 RETURNING *",
      [trust, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      message: `Trust updated to ${trust}`,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating trust:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Update payment status
router.put("/:id/payment-status", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE sign_up SET payment_status = TRUE WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      message: "Payment approved successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Get user by ID (alternative simple endpoint)
router.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM sign_up WHERE id=$1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Error fetching user" });
  }
});

// ✅ Update user status (pause / active / block)
router.put("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: "Status is required" });
  }

  try {
    let query, values;

    if (status === "pause") {
      query = "UPDATE sign_up SET status = $1, pause_start = NOW() WHERE id = $2 RETURNING *";
      values = [status, id];
    } else if (status === "active") {
      query = "UPDATE sign_up SET status = $1 WHERE id = $2 RETURNING *";
      values = [status, id];
    } else if (status === "block") {
      query = "UPDATE sign_up SET status = $1, block_date = NOW() WHERE id = $2 RETURNING *";
      values = [status, id];
    } else {
      query = "UPDATE sign_up SET status = $1 WHERE id = $2 RETURNING *";
      values = [status, id];
    }

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "Status updated successfully", user: result.rows[0] });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Update user profile (only update fields that are sent)
router.put("/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }

    // Build SET clause dynamically
    const setClauses = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {  // only include fields that are sent
        setClauses.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided for update" });
    }

    values.push(id); // last value is for WHERE clause

    const query = `UPDATE sign_up SET ${setClauses.join(", ")} WHERE id = $${i} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "Profile updated successfully", user: result.rows[0] });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Add new user
router.post("/add-user", async (req, res) => {
  try {
    const { full_name, email, phone_number, dob, gender, country_code, business_plan, reference_code } = req.body;

    const result = await pool.query(
      `INSERT INTO sign_up (full_name, email, phone_number, dob, gender, country_code, business_plan, reference_code, created_at) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
      [full_name, email, phone_number, dob, gender, country_code, business_plan, reference_code]
    );

    res.json({ success: true, message: "User added successfully", user: result.rows[0] });
  } catch (error) {
    console.error("Error inserting user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Get referral details
router.get("/referral/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT full_name, reference_code FROM sign_up WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, referral: result.rows[0] });
  } catch (error) {
    console.error("Error fetching referral code:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Apply referral code
router.post("/apply-referral/:id", async (req, res) => {
  try {
    const { id } = req.params; // user applying the referral
    const { referralCode } = req.body;

    // Get current user
    const userRes = await pool.query("SELECT reference_code, under_ref FROM sign_up WHERE id=$1", [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });

    const user = userRes.rows[0];
    if (user.under_ref) {
      return res.status(400).json({ success: false, message: "Referral code already applied" });
    }
    if (user.reference_code === referralCode) {
      return res.status(400).json({ success: false, message: "Own reference_code not allowed" });
    }

    // Check if referral code exists
    const refUserRes = await pool.query("SELECT id FROM sign_up WHERE reference_code=$1", [referralCode]);
    if (refUserRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid referral code" });
    }

    const refUserId = refUserRes.rows[0].id;

    // Save under_ref + increment referral_count
    await pool.query("UPDATE sign_up SET under_ref=$1 WHERE id=$2", [referralCode, id]);
    await pool.query("UPDATE sign_up SET reference_count = reference_count + 1 WHERE id=$1", [refUserId]);

    res.json({ success: true, message: "Referral applied successfully" });
  } catch (error) {
    console.error("Error applying referral:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Check if a user already has under_ref
router.get("/:id/check-ref", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT id, full_name, under_ref FROM sign_up WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      id: user.id,
      full_name: user.full_name,
      under_ref: user.under_ref,
      hasReferrer: !!user.under_ref, // true if not null
    });
  } catch (error) {
    console.error("Error checking referral:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Test route to fetch user details by ID
router.get("/:id/details", getUserDetails);

router.get("/test-email", async (req, res) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // ✅ Use Resend's verified domain
      to: 'support@knowo.world', // Your email
      subject: 'Test Email from Resend - Knowo World',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #333;">✅ Test Email Successful!</h2>
          <p>This is a test email from your Knowo World application.</p>
          <p><strong>Domain verification pending for knowo.world</strong></p>
          <p><strong>Server Time:</strong> ${new Date().toString()}</p>
        </div>
      `
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to send test email",
        error: error.message
      });
    }

    res.json({
      success: true,
      message: "Test email sent successfully via Resend!",
      emailId: data.id,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error in /test-email:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
});

// ✅ Upload and save profile image to DB
router.post("/upload-profile/:id", async (req, res) => {
  try {
    const { image } = req.body;
    const userId = req.params.id;

    console.log("🟩 Received image length:", image?.length || 0, "for user:", userId);

    if (!image) {
      return res.status(400).json({ success: false, message: "No image provided" });
    }

    const updateQuery = `UPDATE sign_up SET profile_image = $1 WHERE id = $2 RETURNING profile_image`;
    const result = await pool.query(updateQuery, [image, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      message: "Profile image updated successfully",
      profile_image: result.rows[0].profile_image,
    });
  } catch (error) {
    console.error("❌ Error uploading profile image:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ✅ Serve profile image directly (better for caching)
router.get("/profile-image/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      "SELECT profile_image, profile_image_type FROM sign_up WHERE id = $1", 
      [id]
    );

    if (!result.rows.length || !result.rows[0].profile_image) {
      // Return a default image or 404
      return res.status(404).json({ success: false, message: "No image found" });
    }

    const { profile_image, profile_image_type } = result.rows[0];
    
    // Set appropriate headers
    res.set({
      'Content-Type': profile_image_type || 'image/jpeg',
      'Content-Length': profile_image.length,
      'Cache-Control': 'public, max-age=86400' // Cache for 1 day
    });
    
    // Send the binary data directly
    res.send(profile_image);
    
  } catch (err) {
    console.error("Error retrieving image:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Upload profile image as base64 (store as bytea)
router.post("/upload-profile-base64/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { image } = req.body; // base64 string

    console.log("🟩 Received image upload request for user:", id);
    console.log("🟩 Image data length:", image?.length || 0);

    if (!image) {
      return res.status(400).json({ success: false, message: "No image data" });
    }

    // Extract base64 data and mime type
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, message: "Invalid image format" });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    console.log("🟩 Image type:", mimeType, "Size:", buffer.length, "bytes");

    // Update user profile with image as bytea
    const result = await pool.query(
      `UPDATE sign_up 
       SET profile_image = $1, profile_image_type = $2 
       WHERE id = $3 
       RETURNING id`,
      [buffer, mimeType, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log("✅ Profile image saved to database for user:", id);
    
    res.json({
      success: true,
      message: "Profile image uploaded successfully"
    });
  } catch (err) {
    console.error("❌ Error uploading profile image:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Set MPIN
router.post("/set-mpin", async (req, res) => {
  const { email, mpin } = req.body;

  try {
    if (!email || !mpin) {
      return res.status(400).json({ success: false, message: "Missing email or MPIN" });
    }
console.log("📩 /set-mpin body:", req.body);

    // Update only if user exists
    const updateResult = await pool.query(
      "UPDATE sign_up SET mpin = $1 WHERE email = $2 RETURNING id, email, full_name, mpin",
      [mpin, email]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "MPIN set successfully" });
  } catch (err) {
    console.error("Error setting MPIN:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Verify MPIN (for login)
router.post("/verify-mpin", async (req, res) => {
  const { email, mpin } = req.body;

  try {
    if (!email || !mpin) {
      return res.status(400).json({ success: false, message: "Missing email or MPIN" });
    }

    // ✅ MPIN Verify with status + attempts + lockout
const userCheck = await pool.query("SELECT id, mpin, status, last_logout, failed_attempts, lock_until FROM sign_up WHERE email = $1", [email]);

if (userCheck.rows.length === 0) {
  return res.status(404).json({ success: false, message: "User not found" });
}

const user = userCheck.rows[0];
const now = new Date();

// Check if locked
if (user.lock_until && new Date(user.lock_until) > now) {
  return res.json({ success: false, message: "MPIN locked. Try again later." });
}

// Check MPIN match
if (user.mpin === mpin) {
  // Reset failed attempts
  await pool.query("UPDATE sign_up SET failed_attempts = 0 WHERE email = $1", [email]);

  // Check if logged out before
  if (user.last_logout) {
    return res.json({ success: false, redirect: "login", message: "Session expired, please login again." });
  }

  // Check user status
  if (user.status !== "ok") {
    return res.json({ success: false, redirect: "login", message: "Account not active." });
  }

  // Success
  return res.json({
    success: true,
    message: "MPIN verified successfully",
    user_id: user.id,
  });
} else {
  // Wrong MPIN — increment failed attempts
  const newAttempts = (user.failed_attempts || 0) + 1;

  if (newAttempts >= 5) {
    const lockUntil = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
    await pool.query("UPDATE sign_up SET failed_attempts = 0, lock_until = $1 WHERE email = $2", [lockUntil, email]);
    return res.json({ success: false, message: "Too many attempts. Locked for 4 hours." });
  } else {
    await pool.query("UPDATE sign_up SET failed_attempts = $1 WHERE email = $2", [newAttempts, email]);
    return res.json({ success: false, message: `Wrong MPIN. ${5 - newAttempts} attempts left.` });
  }
}

  } catch (err) {
    console.error("Error verifying MPIN:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Enhanced MPIN-only verification with browser detection
router.post("/verify-mpin-only", async (req, res) => {
  const { mpin } = req.body;

  try {
    // 🔒 Browser detection - Block browser requests
    if (req.isBrowserRequest) {
      console.log("🚫 Browser access blocked for MPIN verification");
      return res.status(403).json({ 
        success: false, 
        message: "Access denied. Please use mobile app." 
      });
    }

    if (!mpin) {
      return res.status(400).json({ success: false, message: "MPIN required" });
    }

    console.log("🔐 MPIN-only verification attempt:", mpin);

    // ✅ Find user by MPIN only
    const userCheck = await pool.query(
      "SELECT id, email, mpin, status, last_logout, failed_attempts, lock_until FROM sign_up WHERE mpin = $1",
      [mpin]
    );

    if (userCheck.rows.length === 0) {
      console.log("❌ No user found with MPIN:", mpin);
      
      // 🔒 Increment failed attempts for security (optional)
      await pool.query(
        `UPDATE sign_up SET failed_attempts = failed_attempts + 1 
         WHERE failed_attempts < 5 AND lock_until IS NULL`
      );
      
      return res.json({ 
        success: false, 
        message: "Invalid MPIN",
        redirect: "login" // 🔒 Always redirect to login on wrong MPIN
      });
    }

    const user = userCheck.rows[0];
    const now = new Date();

    // Check if locked
    if (user.lock_until && new Date(user.lock_until) > now) {
      return res.json({ 
        success: false, 
        message: "MPIN locked. Try again after 4 hours.",
        redirect: "login"
      });
    }

    // 🔒 MPIN matches - but check all security conditions
    let shouldRedirect = false;
    let message = "";

    // Check if user was logged out
    if (user.last_logout) {
      shouldRedirect = true;
      message = "Session expired. Please login again.";
    }

    // Check user status
    if (user.status !== "ok") {
      shouldRedirect = true;
      message = "Account not active. Please contact admin.";
    }

    // 🔒 If any security check fails, redirect to login
    if (shouldRedirect) {
      await pool.query(
        "UPDATE sign_up SET failed_attempts = failed_attempts + 1 WHERE id = $1",
        [user.id]
      );
      
      return res.json({ 
        success: false, 
        redirect: "login", 
        message: message 
      });
    }

    // ✅ SUCCESS - Reset failed attempts and proceed
    await pool.query(
      "UPDATE sign_up SET failed_attempts = 0, lock_until = NULL WHERE id = $1",
      [user.id]
    );

    console.log("✅ MPIN verified for user:", user.id);
    return res.json({
      success: true,
      message: "MPIN verified successfully",
      user_id: user.id,
      email: user.email
    });

  } catch (err) {
    console.error("Error in MPIN-only verification:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      redirect: "login" // 🔒 Redirect to login on server error for security
    });
  }
});

// Test endpoint to verify browser detection
router.get("/test-browser", (req, res) => {
  res.json({
    isBrowser: req.isBrowserRequest,
    userAgent: req.headers['user-agent'],
    message: req.isBrowserRequest ? "🚫 Browser access detected" : "✅ Mobile app access"
  });
});

module.exports = router;
