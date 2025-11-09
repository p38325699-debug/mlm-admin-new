// backend/cronJobs/unverifyIfNoMpin.js
const pool = require("../config/db");
const cron = require("node-cron");

// Runs every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  try {
    const res = await pool.query(`
      UPDATE sign_up
      SET verified = false
      WHERE verified = true 
        AND (mpin IS NULL OR mpin = '')
        AND verified_at IS NOT NULL
        AND NOW() - verified_at > INTERVAL '1 hour'
      RETURNING email;
    `);

    if (res.rowCount > 0) {
      console.log(`⏰ Unverified ${res.rowCount} users (no MPIN set after 1h).`);
    }
  } catch (err) {
    console.error("❌ Error un-verifying users:", err.message);
  }
});
