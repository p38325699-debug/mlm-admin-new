// backend/cronJobs/planDeduction.js
const pool = require("../config/db");
const cron = require("node-cron");

// 💰 Define plan prices
const PLAN_PRICES = {
  Bronze: 10,
  Silver: 50,
  "Gold 1": 100,
  "Gold 2": 200,
  "Premium 1": 300,
  "Premium 2": 400,
  "Premium 3": 500,
  "Premium 4": 600,
  "Premium 5": 700,
};

// 🕛 Run daily at 12:10 PM (IST safe if you use timezone below)
// cron.schedule("10 12 * * *",
// 🕛 Run daily at 11:59 PM
 cron.schedule("59 23 * * *",
  async () => {
    console.log("🔁 Running daily plan deduction check...");

    try {
      const now = new Date();

      // Fetch all users with a plan start date
      const { rows: users } = await pool.query(`
        SELECT id, full_name, first_plan_date, business_plan, coin
        FROM sign_up
        WHERE first_plan_date IS NOT NULL
      `);

      for (const user of users) {
        const price = PLAN_PRICES[user.business_plan];
        if (!price) continue;

        const start = new Date(user.first_plan_date);
        const daysPassed = Math.floor((now - start) / (1000 * 60 * 60 * 24));

        // 🟡 1 day passed → send warning
        // if (daysPassed === 1) {
        // 🟡 Day 25–29 → send notification daily
 if (daysPassed >= 25 && daysPassed <= 29) {
          const warnMsg = `⚠️ Reminder: Your monthly ${user.business_plan} plan ($${(
            price * 0.1
          ).toFixed(2)}) fee will be deducted soon.`;

          await pool.query(
            `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
            [user.id, warnMsg, "warning"]
          );

          console.log(`📢 Sent warning to ${user.full_name}`);
        }

        // 🔴 2 days passed → deduct 10%
        // if (daysPassed === 2) {
        // 🔴 Day 30 → deduct 10%
 if (daysPassed === 30) {
          const deductAmount = price * 0.1;

          if (parseFloat(user.coin) >= deductAmount) {
            await pool.query(`UPDATE sign_up SET coin = coin - $1 WHERE id = $2`, [
              deductAmount,
              user.id,
            ]);

            const successMsg = `💳 10% (${deductAmount.toFixed(
              2
            )}$) has been deducted for your monthly ${user.business_plan} plan renewal.`;

            await pool.query(
              `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
              [user.id, successMsg, "deduct"]
            );

            console.log(`✅ Deducted ${deductAmount}$ from ${user.full_name}`);
          } else {
            const failMsg = `❌ Deduction failed! Not enough balance for ${user.business_plan} plan fee.`;

            await pool.query(
              `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)`,
              [user.id, failMsg, "error"]
            );

            console.log(`⚠️ ${user.full_name} has insufficient balance`);
          }
        }
      }

      console.log("🎯 Plan deduction cron completed successfully.");
    } catch (error) {
      console.error("💥 Plan deduction cron error:", error.message);
    }
  },
  { timezone: "Asia/Kolkata" } // 🕐 ensure timing works in IST
);
