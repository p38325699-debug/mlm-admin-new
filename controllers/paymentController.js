// backend/controllers/paymentController.js
const pool = require("../config/db");
const path = require("path");
const fs = require("fs");

const planRank = {
  "Renew": 0,
  "Bronze": 1,
  "Silver": 2,
  "Gold 1": 3,
  "Gold 2": 4,
  "Premium 1": 5,
  "Premium 2": 6,
  "Premium 3": 7,
  "Premium 4": 8,
  "Premium 5": 9,
};

// ✅ Plan prices for 10% maintenance fee
const planPrices = {
  "Silver": 60,
  "Gold 1": 100,
  "Gold 2": 200,
  "Premium 1": 500,
  "Premium 2": 1000,
  "Premium 3": 2000,
  "Premium 4": 5000,
  "Premium 5": 10000
};

const upgradeRequirements = {
  "Renew": { count: 0, minPlan: "Bronze" },
  "Silver": { count: 0, minPlan: "Bronze" },
  "Gold 1": { count: 5, minPlan: "Silver" },
  "Gold 2": { count: 10, minPlan: "Silver" },
  "Premium 1": { count: 25, minPlan: "Gold 1" },
  "Premium 2": { count: 50, minPlan: "Gold 1" },
  "Premium 3": { count: 100, minPlan: "Gold 1" },
  "Premium 4": { count: 200, minPlan: "Gold 1" },
  "Premium 5": { count: 500, minPlan: "Gold 1" }
};

function checkEligibility(selectedPlan, user, refPlans) {
  if (selectedPlan === "Renew" || !upgradeRequirements[selectedPlan]) {
    return true;
  }

  const { count, minPlan } = upgradeRequirements[selectedPlan];
  const minRank = planRank[minPlan] || 0;

  if (user.reference_count < count) return false;

  const validRefs = refPlans.filter(r => (planRank[r] || 0) >= minRank);
  if (validRefs.length < count) return false;

  return true;
}

exports.upgradePlan = async (req, res) => {
  try {
    const { userId, plan, utr } = req.body;
    const screenshot = req.file ? req.file.filename : null;

    const utrRegex = /^[a-zA-Z0-9]+$/;
    if (utr && !utrRegex.test(utr)) {
      return res.status(400).json({ message: "UTR must contain only letters and numbers" });
    }

    const userResult = await pool.query(
      "SELECT id, full_name, business_plan, trust, reference_count, first_plan_date FROM sign_up WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];
    const oldPlan = user.business_plan;
    let newPlan;

    if (plan === "Renew") {
      newPlan = oldPlan;
    } else {
      const refPlans = [];
      if (!checkEligibility(plan, user, refPlans)) {
        return res.status(400).json({ message: "Condition didn't match. Read App Instructions." });
      }
      newPlan = plan;
    }

    const planPrice = planPrices[newPlan] || 0;
    const maintenanceFee = planPrice * 0.10;

    if (!user.trust) {
      const message = `${user.full_name} requested upgrade from ${oldPlan} to ${newPlan}. Waiting for admin approval.`;

      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [userId, message]
      );

      await pool.query(
        `INSERT INTO app_maintenance (user_id, plan, fee_amount, created_at)
        VALUES ($1, $2, $3, NOW())`,
        [userId, newPlan, maintenanceFee]
      );

      // ✅ First billing cycle starts only if upgrading first time
      if (!user.first_plan_date) {
       // ✅ Always restart billing when plan is upgraded
await pool.query(
  `UPDATE sign_up SET first_plan_date = NOW() WHERE id = $1`,
  [userId]
);

      }

      return res.status(403).json({
        message: "Wait for admin approval. It may take 24-48 hours",
        redirect: "home"
      });
    }

    await pool.query(
      "UPDATE sign_up SET business_plan = $1, payment_status = true WHERE id = $2",
      [newPlan, userId]
    );

    await pool.query(
      `INSERT INTO app_maintenance (user_id, plan, fee_amount, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, newPlan, maintenanceFee]
    );

    // ✅ Restart billing date only if moving from Bronze or NULL
    await pool.query(
      `UPDATE sign_up SET first_plan_date = NOW() 
       WHERE id = $1 
       AND (first_plan_date IS NULL OR business_plan = 'Bronze')`,
      [userId]
    );

    await pool.query(
      "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
      [
        userId,
        `${user.full_name} updated his business_plan from ${oldPlan} to ${newPlan}`
      ]
    );

    return res.json({
      message: "Business plan upgraded successfully",
      newPlan,
      maintenanceFee
    });

  } catch (err) {
    console.error("Upgrade error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
