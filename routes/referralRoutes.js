// ✅ backend/routes/referralRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const plans = require("../utils/plans");
const distributeMaintenance = require("../utils/maintenanceDistributor");

// 🧠 Commission rates per level (in %)
const COMMISSION_RATES = [30, 20, 15, 10, 5, 3, 2, 1, 0.5, 0.25];

// ------------------------------------------------------
// 🟢 Apply Referral Code
// ------------------------------------------------------
router.post("/apply", async (req, res) => {
  try {
    const { userId, referralCode } = req.body;
    if (!userId || !referralCode)
      return res.status(400).json({ success: false, message: "Missing fields" });

    // Find parent (referrer)
    const parentRes = await pool.query(
      "SELECT id, reference_code FROM sign_up WHERE reference_code = $1",
      [referralCode]
    );
    if (parentRes.rows.length === 0)
      return res.status(400).json({ success: false, message: "Invalid referral code" });

    const parent = parentRes.rows[0];

    // Check user
    const userRes = await pool.query(
      "SELECT id, reference_code, under_ref FROM sign_up WHERE id = $1",
      [userId]
    );
    if (userRes.rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = userRes.rows[0];
    if (user.reference_code === referralCode)
      return res.status(400).json({ success: false, message: "Cannot use own referral code" });

    if (user.under_ref)
      return res.status(400).json({ success: false, message: "Referral already applied" });

    // Update user's ref and parent's count
    await pool.query("UPDATE sign_up SET under_ref = $1 WHERE id = $2", [referralCode, userId]);
    await pool.query("UPDATE sign_up SET reference_count = reference_count + 1 WHERE id = $1", [
      parent.id,
    ]);

    res.json({ success: true, message: "Referral applied successfully" });
  } catch (err) {
    console.error("Referral apply error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Get User Referral Data + Business Plan + Reference Count
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 🟢 Fetch user's own referral and plan data
    const userQuery = `
      SELECT id, full_name, email, under_ref, reference_code, business_plan, reference_count
      FROM public.sign_up
      WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [id]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];

    // 🟣 Fetch members referred by this user (include their reference_count)
    const refQuery = `
      SELECT 
        id, 
        full_name, 
        email, 
        business_plan, 
        reference_code, 
        under_ref,
        reference_count
      FROM public.sign_up
      WHERE under_ref = $1
      ORDER BY id ASC
    `;
    const refResult = await pool.query(refQuery, [user.reference_code]);

    // 🧠 Build the final response
    return res.status(200).json({
      success: true,
      user,
      referred_members: refResult.rows,
    });

  } catch (err) {
    console.error("💥 Referral fetch error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});



// ------------------------------------------------------
// 🟢 Get Upline Users (up to 10 levels)
// ------------------------------------------------------
async function getUplines(referralCode, client) {
  const uplines = [];
  let currentRef = referralCode;

  for (let level = 1; level <= 10 && currentRef; level++) {
    const res = await client.query(
      "SELECT id, full_name, reference_code, under_ref FROM sign_up WHERE reference_code = $1",
      [currentRef]
    );
    if (res.rows.length === 0) break;
    const upline = res.rows[0];
    uplines.push({ ...upline, level });
    currentRef = upline.under_ref;
  }

  return uplines;
}

// ------------------------------------------------------
// 🟢 Upgrade Plan + Multi-Level + Maintenance Commission
// ------------------------------------------------------


router.post("/upgrade-plan", async (req, res) => {
  const client = await pool.connect();

  try {
    const { userId, newPlan } = req.body;
    if (!userId || !newPlan)
      return res.status(400).json({ success: false, message: "Missing userId or newPlan" });

    const planPrice = plans[newPlan];
    if (planPrice === undefined)
      return res.status(400).json({ success: false, message: "Invalid plan name" });

    await client.query("BEGIN");

    // Get user info
    const userRes = await client.query(
      "SELECT id, full_name, reference_code, under_ref FROM sign_up WHERE id = $1",
      [userId]
    );
    if (userRes.rows.length === 0) throw new Error("User not found");
    const user = userRes.rows[0];

    // Update user’s plan
    await client.query(
      "UPDATE sign_up SET business_plan = $1, first_plan_date = NOW() WHERE id = $2",
      [newPlan, userId]
    );

    // Fetch upline tree (10 levels max)
    const uplines = await getUplines(user.under_ref, client);

    // 💸 Direct sponsor bonus (10%)
    if (uplines.length >= 1) {
      const direct = uplines[0];
      const directBonus = (planPrice * 10) / 100;

      await client.query(
        "UPDATE sign_up SET coin = COALESCE(coin,0) + $1 WHERE id = $2",
        [directBonus, direct.id]
      );

      await client.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [
          direct.id,
          `${user.full_name} upgraded to ${newPlan}. You received direct bonus ₹${directBonus.toFixed(
            2
          )}.`,
        ]
      ); 

      await client.query(
        "INSERT INTO commission_history (user_id, from_user_id, type, amount, level) VALUES ($1,$2,'direct',$3,1)",
        [direct.id, userId, directBonus.toFixed(2)]
      );
    }
 
    // 🟣 Multi-Level Income
    for (const upline of uplines) {
      const rate = COMMISSION_RATES[upline.level - 1];
      if (!rate) continue;
      const commission = (planPrice * rate) / 100;

      await client.query(
        "UPDATE sign_up SET coin = COALESCE(coin,0) + $1 WHERE id = $2",
        [commission, upline.id]
      );

      await client.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [
          upline.id,
          `${user.full_name} upgraded to ${newPlan}. You earned ₹${commission.toFixed(
            2
          )} (${rate}% from Level ${upline.level}).`,
        ]
      );

      await client.query(
        "INSERT INTO commission_history (user_id, from_user_id, type, amount, level) VALUES ($1,$2,'plan',$3,$4)",
        [upline.id, userId, commission.toFixed(2), upline.level]
      );
    }

    await client.query("COMMIT");

    // ✅ If user upgraded to Gold 1, trigger reward tree check
if (newPlan === "Gold 1") {
  const updateGold1Rewards = require("../utils/goldRewardHandler");
  // await updateGold1Rewards(userId); 
  if (uplines.length > 0) {
  await updateGold1Rewards(uplines[0].id);  // Direct upline gets Gold1 count
}

}


    // 🧩 After commit — call maintenanceDistributor
    const totalPaid = planPrice * 1.1; // including 10% maintenance
    await distributeMaintenance(userId, planPrice, totalPaid);

    res.json({
      success: true,
      message:
        "Plan upgraded successfully. Multi-level commissions and maintenance distributed.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Upgrade Plan Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});


// ------------------------------------------------------
// 🟠 Referral Tree (up to 10 levels)
// ------------------------------------------------------
router.get("/tree/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `
      WITH RECURSIVE tree AS (
        SELECT 
          id, 
          full_name, 
          reference_code, 
          under_ref, 
          business_plan, 
          reference_count,
          0 AS level
        FROM sign_up
        WHERE id = $1

        UNION ALL

        SELECT 
          s.id, 
          s.full_name, 
          s.reference_code, 
          s.under_ref, 
          s.business_plan, 
          s.reference_count,
          t.level + 1
        FROM sign_up s
        INNER JOIN tree t 
          ON s.under_ref = t.reference_code
        WHERE t.level < 10
      )
      SELECT * FROM tree ORDER BY level, id;
      `,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Referral Tree Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
 