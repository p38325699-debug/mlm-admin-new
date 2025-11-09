// backend/controllers/referralController.js
const pool = require("../config/db");

exports.getReferralCode = async (req, res) => {
  try {
    const { id } = req.params;

    // fetch from DB (sign_up table, reference_code column)
    const result = await pool.query(
      "SELECT reference_code FROM sign_up WHERE id = $1",
      [id]
    );
  
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ reference_code: result.rows[0].reference_code }); // 🔑 matches frontend
  } catch (err) {
    console.error("Error fetching referral:", err);
    res.status(500).json({ message: "Server error" });
  }
};
  