// backend/cronJobs/dailyQuizInit.js
const cron = require("node-cron");
const pool = require("../config/db");

// Runs every day at midnight (00:00)
cron.schedule("0 0 * * *", async () => {
  console.log("🌅 Running daily quiz initialization...");

  try {
    // Insert today's quiz rows for all users if not already present
    const insertQuery = `
      INSERT INTO quiz_history (user_id, quiz_date)
      SELECT s.id, CURRENT_DATE
      FROM sign_up s
      WHERE NOT EXISTS (
        SELECT 1 FROM quiz_history q
        WHERE q.user_id = s.id
        AND q.quiz_date = CURRENT_DATE
      );
    `;

    const result = await pool.query(insertQuery);
    console.log(`✅ Daily quiz rows inserted successfully`);
  } catch (err) {
    console.error("❌ Error inserting daily quiz rows:", err.message);
  }
});
