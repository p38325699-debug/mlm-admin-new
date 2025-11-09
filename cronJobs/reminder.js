const pool = require("../config/db");
const cron = require("node-cron");

const reminderNotification = () => {
  // Runs every day at 12:00 UTC
  cron.schedule("0 12 25-29 * *", async () => {
    console.log("🔔 Sending maintenance reminders...");

    const monthName = new Date().toLocaleString("en-US", { month: "long" });
    const message = `⚠️ On 30th ${monthName}, $6 will be deducted for account maintenance. Please ensure you have enough balance.`;

    try {
      const users = await pool.query("SELECT id FROM sign_up");

      for (const user of users.rows) {
        await pool.query(
          "INSERT INTO notifications (user_id, message, created_at) VALUES ($1, $2, NOW())",
          [user.id, message]
        );
      }

      console.log("✅ Reminders sent successfully.");
    } catch (error) {
      console.error("❌ Reminder notification error:", error.message);
    }
  }, { timezone: "UTC" });
};

module.exports = reminderNotification;
