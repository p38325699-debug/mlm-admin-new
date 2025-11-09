// backend/routes/cronRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// Plan price mapping (same as you used)
const planPrices = {
  "Silver": 60,
  "Gold 1": 100,
  "Gold 2": 200,
  "Premium 1": 500,
  "Premium 2": 1000,
  "Premium 3": 2000,
  "Premium 4": 5000,
  "Premium 5": 10000,
};

// Distribution percentages for levels 1..10 (as decimals)
const levelPercent = [
  0.30,   // Level 1 -> 30%
  0.20,   // Level 2 -> 20%
  0.15,   // Level 3 -> 15%
  0.10,   // Level 4 -> 10%
  0.05,   // Level 5 -> 5%
  0.03,   // Level 6 -> 3%
  0.02,   // Level 7 -> 2%
  0.01,   // Level 8 -> 1%
  0.005,  // Level 9 -> 0.5%
  0.0025, // Level 10 -> 0.25%
];

// Helper: find uplines up to 10 levels (closest first)
async function getUplines(client, userId) {
  // We will use a recursive CTE: start from the user's under_ref and walk up
  // The CTE returns: level, id, full_name, coin, reference_code
  const q = `
    WITH RECURSIVE uplines AS (
      -- start: level 1 is the immediate upline (whose reference_code == user's under_ref)
      SELECT
        1 AS lvl,
        u.id,
        u.full_name,
        u.coin,
        u.reference_code,
        u.under_ref
      FROM sign_up u
      WHERE u.reference_code = (SELECT under_ref FROM sign_up WHERE id = $1)

      UNION ALL

      SELECT
        uplines.lvl + 1,
        u2.id,
        u2.full_name,
        u2.coin,
        u2.reference_code,
        u2.under_ref
      FROM uplines
      JOIN sign_up u2 ON u2.reference_code = uplines.under_ref
      WHERE uplines.lvl < 10
    )
    SELECT * FROM uplines ORDER BY lvl;
  `;

  const { rows } = await client.query(q, [userId]);
  return rows; // each has lvl, id, full_name, coin, reference_code, under_ref
}

// Route: manual-run/:userId
// Behavior:
//  - Day 1 -> create warning notification if not exists (no deduction)
//  - Day >=2 -> attempt deduction; if success -> deduct, reset first_plan_date, distribute to uplines; if fail -> downgrade to Bronze (first_plan_date = NULL) and notify uplines 'no income'
router.get("/manual-run/:userId", async (req, res) => {
  const { userId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // fetch user
    const { rows } = await client.query(
      `SELECT id, full_name, business_plan, coin, first_plan_date, reference_code FROM sign_up WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = rows[0];

    if (!user.first_plan_date || !user.business_plan || user.business_plan === "Bronze") {
      await client.query("ROLLBACK");
      return res.json({ success: true, message: "No active plan" });
    }

    const firstDate = new Date(user.first_plan_date);
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysPassed = Math.floor((now - firstDate) / msPerDay);

    const planPrice = planPrices[user.business_plan];

    if (!planPrice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Unknown plan price" });
    }

    const fee = +(planPrice * 0.10).toFixed(2);

  // ---------- Day 25–29: show daily notifications ----------
if (daysPassed >= 25 && daysPassed <= 29) {

      // Create warning notification once
      const { rowCount: alreadyWarned } = await client.query(`
        SELECT 1 FROM notifications
        WHERE user_id = $1
          AND message LIKE '%Maintenance fee will be deduct soon%'
      `, [userId]);

      if (alreadyWarned === 0) {
        await client.query(`
          INSERT INTO notifications (user_id, message, type)
          VALUES ($1, $2, 'warning')
        `, [userId, `⚠️ Maintenance fee of $${fee.toFixed(2)} will be deducted soon! Please maintain balance.`]);
      }

      await client.query("COMMIT");
      return res.json({ success: true, message: `Warning created for ${user.full_name}`, fee });
    }

    // ---------- Day >= 30 : attempt deduction ----------
    // if (daysPassed >= 2) {
    if (daysPassed === 30) {
      const newBalance = +(user.coin - fee).toFixed(2);

      if (newBalance >= 0) {
        // Deduct and reset first_plan_date to NOW()
        await client.query(
          `UPDATE sign_up SET coin = $1, first_plan_date = NOW() WHERE id = $2`,
          [newBalance, userId]
        );

        // Insert deduction notification for the user
        await client.query(
          `INSERT INTO notifications (user_id, message, type)
           VALUES ($1, $2, 'deduction')`,
          [userId, `💸 Maintenance fee deducted: -$${fee.toFixed(2)}. New balance: $${newBalance.toFixed(2)}`]
        );

        // Distribution to uplines
        const uplines = await getUplines(client, userId); // ordered by lvl ascending

        const distributionResults = [];
        if (uplines && uplines.length > 0) {
          for (const u of uplines) {
            const lvlIndex = u.lvl - 1;
            if (lvlIndex < 0 || lvlIndex >= levelPercent.length) continue;
            const pct = levelPercent[lvlIndex];
            const share = +(fee * pct).toFixed(2);
            if (share <= 0) continue;

            // Credit the upline
            await client.query(
              `UPDATE sign_up SET coin = coin + $1 WHERE id = $2`,
              [share, u.id]
            );

            // Notification to upline
            const message = `🎉 You received $${share.toFixed(2)} from ${user.full_name} (maintenance share, level ${u.lvl})`;
            await client.query(
              `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'income')`,
              [u.id, message]
            );

            distributionResults.push({ level: u.lvl, uplineId: u.id, uplineName: u.full_name, share });
          }
        }

        await client.query("COMMIT");
        return res.json({ success: true, message: "Fee deducted and distributed", fee, distributed: distributionResults });
      } else {
        // Insufficient funds -> set to Bronze, keep coin negative as per your request, clear first_plan_date
        await client.query(
          `UPDATE sign_up SET business_plan = 'Bronze', first_plan_date = NULL, coin = $1 WHERE id = $2`,
          [newBalance, userId]
        );

        // Insert downgrade notification for user
        await client.query(
          `INSERT INTO notifications (user_id, message, type)
           VALUES ($1, '⚠️ Insufficient balance. Auto downgraded to Bronze.', 'downgrade')`,
          [userId]
        );

        // Notify uplines that no income was received
        const uplines = await getUplines(client, userId);
        if (uplines && uplines.length > 0) {
          for (const u of uplines) {
            const message = `⚠️ ${user.full_name} did not pay maintenance. No income received for your level ${u.lvl}.`;
            await client.query(
              `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'info')`,
              [u.id, message]
            );
          }
        }

        await client.query("COMMIT");
        return res.json({ success: true, message: "Insufficient funds, downgraded to Bronze", newBalance });
      }
    }

    // Not due yet
    await client.query("COMMIT");
    return res.json({ success: true, message: "Maintenance period active, not due yet" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Manual cron error:", err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
