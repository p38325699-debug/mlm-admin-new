// server/cronJobs/dailyCheck.js
import cron from "node-cron";
import fetch from "node-fetch";
import pool from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL;

// 🕛 Runs daily at 11:59 PM for maintenance cycle check
// cron.schedule("* * * * *", async () => {
  cron.schedule("59 23 * * *", async () => {

 console.log("🕛 Running daily maintenance cycle check (11:59 PM)...");


  try {
    const { rows: users } = await pool.query("SELECT id FROM sign_up");
    if (users.length === 0) {
      console.log("⚠️ No users found to process.");
      return;
    }

    for (const user of users) {
      const url = `${API_BASE_URL}/api/cron/manual-run/${user.id}?from=cron`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`❌ Failed for user ${user.id}: ${res.statusText}`);
        } else {
          console.log(`✅ Checked user ID ${user.id}`);
        }
      } catch (err) {
        console.error(`❌ Fetch error for user ${user.id}:`, err.message);
      }
    }

    console.log("✅ All user checks complete");
  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
}, {
  timezone: "UTC",
});

console.log("🟢 dailyCheck.js loaded and scheduled successfully");
