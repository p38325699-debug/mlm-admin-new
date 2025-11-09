// ✅ backend/utils/maintenanceDistributor.js
const pool = require("../config/db");

// 🧮 10-level rental percentage chart
const rentalPercents = [30, 20, 15, 10, 5, 3, 2, 1, 0.5, 0.25];

/**
 * Distribute maintenance income up to 10 levels
 * @param {number} userId - The user who triggered payment
 * @param {number} planAmount - The base plan cost (e.g. $60)
 * @param {number} totalPaid - The total amount user paid (e.g. $66)
 */
async function distributeMaintenance(userId, planAmount, totalPaid) {
  try {
    const maintenanceAmount = totalPaid - planAmount;
    let remainingAmount = totalPaid;

    // 🟢 Step 1: Get user's referral (under_ref)
    const userRes = await pool.query(
      "SELECT under_ref FROM sign_up WHERE id = $1",
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.log("⚠️ User not found for maintenance distribution");
      return;
    }

    let currentRefCode = userRes.rows[0].under_ref;
    let level = 1;

    // 🟢 Step 2: Traverse uplines up to 10 levels
    while (currentRefCode && level <= 10) {
      const refRes = await pool.query(
        "SELECT id, under_ref FROM sign_up WHERE reference_code = $1",
        [currentRefCode]
      );

      if (refRes.rows.length === 0) break;
      const refUser = refRes.rows[0];
      let bonus = 0;

      if (level === 1) {
        // 🟢 Level 1 (Direct Sponsor) → 10% direct + rental %
        const directBonus = planAmount * 0.1; // 10%
        const rentalBonus = maintenanceAmount * (rentalPercents[level - 1] / 100);
        bonus = directBonus + rentalBonus;
      } else {
        // 🟣 Other levels → only rental %
        bonus = maintenanceAmount * (rentalPercents[level - 1] / 100);
      }

      if (bonus > 0) {
        // 💰 Update user's coin balance
        await pool.query(
          "UPDATE sign_up SET coin = COALESCE(coin, 0) + $1 WHERE id = $2",
          [bonus, refUser.id]
        );

        // 🧾 Record commission history
        await pool.query(
          `INSERT INTO commission_history (user_id, from_user_id, type, amount, level)
           VALUES ($1, $2, $3, $4, $5)`,
          [refUser.id, userId, "maintenance", bonus, level]
        );

        // 🔔 Notification
        await pool.query(
          `INSERT INTO notifications (user_id, message, type)
           VALUES ($1, $2, $3)`,
          [
            refUser.id,
            `You earned $${bonus.toFixed(2)} from Level ${level} user (ID ${userId})`,
            "income",
          ]
        );

        remainingAmount -= bonus;
      }

      currentRefCode = refUser.under_ref;
      level++;
    }

    // 🧩 Step 3: Admin keeps remaining
    if (remainingAmount > 0) {
      console.log(
        `💰 Admin received remaining: $${remainingAmount.toFixed(2)} (after 10 levels)`
      );
      // Optionally insert into admin_wallet or admin_income table
    }

    console.log("✅ Maintenance distribution completed successfully.");
  } catch (err) {
    console.error("❌ Error in distributeMaintenance:", err.message);
  }
}

module.exports = distributeMaintenance;
