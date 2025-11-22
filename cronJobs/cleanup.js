// backend/cronJobs/cleanup.js
const cron = require("node-cron");
const pool = require("../config/db");

 
// Run daily at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    await pool.query("DELETE FROM quiz_history WHERE quiz_date < CURRENT_DATE - INTERVAL '90 days'");
    console.log("✅ Old quiz history cleaned up");
  } catch (err) {
    console.error("❌ Cleanup failed:", err.message);
  }
});
