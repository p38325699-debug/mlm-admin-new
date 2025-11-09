// ✅ backend/utils/cronJobs.js
const pool = require("../config/db");
const plans = require("./plans");
const { CronJob } = require("cron");

// 🧠 Commission rates per level (same as referral)
const COMMISSION_RATES = [10, 5, 3, 2, 1, 1, 0.5, 0.5, 0.5, 0.5];

// 🔁 Helper to get uplines
async function getUplines(userId, levels = 10) {
  const uplines = [];
  let currentUser = userId;

  for (let level = 1; level <= levels; level++) {
    const result = await pool.query(
      "SELECT s.id, s.referral_id, s.full_name FROM sign_up s WHERE s.id = (SELECT referral_id FROM sign_up WHERE id = $1)",
      [currentUser]
    );
    if (result.rows.length === 0 || !result.rows[0].referral_id) break;

    const upline = result.rows[0];
    uplines.push({ id: upline.id, full_name: upline.full_name, level });
    currentUser = upline.id;
  }

  return uplines;
}

// 🕒 Main Cron Job – runs every day at 00:00 (midnight)
// const maintenanceJob = new CronJob("0 0 * * *", async () => {
  const maintenanceJob = new CronJob("59 23 * * *", async () => {
  console.log("⏰ Running daily maintenance check...");

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, full_name, business_plan, coin,
             DATE_PART('day', NOW() - first_plan_date) AS day_diff
      FROM sign_up
      WHERE business_plan IS NOT NULL AND first_plan_date IS NOT NULL
    `);

    for (const user of result.rows) {
      const { id, full_name, business_plan, day_diff } = user;

      // 🟡 Day 1 → send notification popup
      // if (day_diff === 1) {
      if (day_diff >= 25 && day_diff <= 29) {
        await client.query(
         "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
   [id, "⚠️ Your plan maintenance will be deducted soon. Please maintain balance."]
        );
        console.log(`📩 Popup notification sent to ${full_name}`);
      }

      // 🔴 Day 2 → deduct maintenance (10% of plan price)
      // if (day_diff === 2) {
      if (day_diff === 30) {
        const planPrice = plans[business_plan] || 0;
        const maintenanceAmount = (planPrice * 10) / 100;

        // Deduct from user wallet
        await client.query(
          "UPDATE sign_up SET coin = COALESCE(coin,0) - $1 WHERE id = $2",
          [maintenanceAmount, id]
        );

        await client.query(
          "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
          [id, `₹${maintenanceAmount.toFixed(2)} maintenance deducted from your wallet.`]
        );

        await client.query(
          `INSERT INTO commission_history (user_id, from_user_id, type, amount, level)
           VALUES ($1,$2,'maintenance_deduct',$3,$4)`,
          [id, id, maintenanceAmount.toFixed(2), 0]
        );

        // 🔁 Distribute maintenance to 10 uplines
        const uplines = await getUplines(id);
        for (const upline of uplines) {
          const rate = COMMISSION_RATES[upline.level - 1];
          if (!rate) continue;

          const commission = (maintenanceAmount * rate) / 100;

          await client.query(
            "UPDATE sign_up SET coin = COALESCE(coin,0) + $1 WHERE id = $2",
            [commission, upline.id]
          );

          const msg = `${full_name} paid maintenance. You received ₹${commission.toFixed(
            2
          )} (${rate}% for Level ${upline.level}).`;
          await client.query(
            "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
            [upline.id, msg]
          );

          await client.query(
            `INSERT INTO commission_history (user_id, from_user_id, type, amount, level)
             VALUES ($1,$2,'maintenance_income',$3,$4)`,
            [upline.id, id, commission.toFixed(2), upline.level]
          );
        }

        console.log(`💸 Maintenance deducted & distributed for ${full_name}`);
      }
    }

    console.log("✅ Daily maintenance process completed.");
  } catch (error) {
    console.error("❌ Error in maintenance job:", error.message);
  } finally {
    client.release();
  }
});

// ▶️ Start the cron job
maintenanceJob.start();
console.log("🟢 Maintenance cron job scheduled (runs daily at midnight)");

module.exports = maintenanceJob;
