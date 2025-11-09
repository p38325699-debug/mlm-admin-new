const pool = require("../config/db");

// exports.getUserDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1️⃣ Get current user (include profile_image)
//     const result = await pool.query(
//       `SELECT 
//          id, 
//          full_name, 
//          email, 
//          phone_number, 
//          dob, 
//          reference_code, 
//          gender, 
//          country_code, 
//          verified, 
//          created_at, 
//          status, 
//          coin, 
//          TRIM(business_plan) AS business_plan, 
//          COALESCE(day_count, 0) AS day_count,
//          under_ref,
//          pause_start,
//          block_date,
//          reference_count,
//          profile_image
//        FROM sign_up 
//        WHERE id = $1`,
//       [id]
//     );

//     if (result.rowCount === 0) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     const user = result.rows[0];

//     // ✅ Convert profile_image BYTEA to Base64 if it exists
//     if (user.profile_image) {
//       user.profile_image = `data:image/png;base64,${user.profile_image.toString("base64")}`;
//     } else {
//       user.profile_image = null;
//     }

//     console.log("🔎 User:", user.id, "under_ref:", user.under_ref);

//     // 2️⃣ If no referrer
//     if (!user.under_ref) {
//       return res.json({
//         success: true,
//         user,
//         hasReferrer: false,
//         referrer: null,
//       });
//     }

//     // 3️⃣ Fetch referrer details
//     const refRes = await pool.query(
//       `SELECT 
//          full_name, 
//          TRIM(business_plan) AS business_plan, 
//          reference_count,
//          reference_code
//        FROM sign_up 
//        WHERE reference_code = $1`,
//       [user.under_ref]
//     );

//     const referrer = refRes.rows.length > 0 ? refRes.rows[0] : null;

//     return res.json({
//       success: true,
//       user,
//       hasReferrer: !!referrer,
//       referrer,
//     });
//   } catch (err) {
//     console.error("❌ Get user details error:", err.message);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };


exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await pool.query(`SELECT * FROM sign_up WHERE id = $1`, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
