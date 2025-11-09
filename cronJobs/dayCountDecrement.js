// backend/cronJobs/dayCountDecrement.js
const cron = require("node-cron");
const pool = require("../config/db"); 

// 🧠 verify DB connection
(async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("🧠 DB connection verified for dayCountDecrement:", result.rows[0]);
  } catch (err) {
    console.error("❌ DB connection failed in dayCountDecrement:", err.message);
  } 
})();

cron.schedule("0 * * * *", async () => {
  const nowUTC = new Date();
  const currentUTCHour = nowUTC.getUTCHours();
  const currentUTCMinute = nowUTC.getUTCMinutes();
  console.log(`⏰ Global dayCount check at UTC ${currentUTCHour}:${currentUTCMinute}`);

  try {
    // Select distinct timezone offsets from users
    const tzRes = await pool.query("SELECT DISTINCT timezone_offset FROM sign_up WHERE timezone_offset IS NOT NULL");
    const zones = tzRes.rows.map(r => parseFloat(r.timezone_offset));

    let totalUpdated = 0;

    for (const offset of zones) {
      // Compute local hour for this timezone
      let localHour = (currentUTCHour + offset + 24) % 24; // offset may be fractional
      const isMidnight = Math.abs(localHour) < 0.25 || Math.abs(localHour - 24) < 0.25; // ~15 min window

      if (isMidnight) {
        const result = await pool.query(`
          UPDATE sign_up
          SET day_count = GREATEST(day_count - 1, 0)
          WHERE day_count > 0 AND timezone_offset = $1
        `, [offset]);
        totalUpdated += result.rowCount;
        console.log(`🌍 Updated ${result.rowCount} users at midnight (offset ${offset})`);
      }
    }

    if (totalUpdated === 0) console.log("🕓 No regions hit midnight this hour.");
    else console.log(`✅ Total users updated this run: ${totalUpdated}`);

  } catch (err) {
    console.error("❌ Global day_count update failed:", err.message);
  }
});

console.log("🟢 Global dayCountDecrement cron (hourly) loaded successfully");
