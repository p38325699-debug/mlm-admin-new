// routes/cryptoRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const pool = require("../config/db");

// ✅ Create Cryptomus Payment
router.post("/crypto-payment", async (req, res) => {
  try {
    console.log("🔵 Incoming Payment Request:", req.body);

    const { user_id, amount, currency = "USD" } = req.body;

    if (!user_id || !amount) {
      console.log("⚠️ Missing Required Fields");
      return res.status(400).json({
        success: false,
        message: "Missing user_id or amount",
      });
    }

    console.log("🧑‍💻 Checking if User Exists in sign_up...", user_id);
    const userCheck = await pool.query(
      `SELECT id FROM sign_up WHERE id = $1`,
      [user_id]
    );

    console.log("✅ User Check Result:", userCheck.rows);

    if (userCheck.rows.length === 0) {
      console.log("❌ Invalid User! Not found in sign_up table.");
      return res.status(400).json({
        success: false,
        message: "Invalid user_id. User not found.",
      });
    }

    const orderId = `CRYPTO_${user_id}_${Date.now()}`;

    const payload = {
      amount: amount.toString(),
      currency,
      order_id: orderId,
      to_currency: "USDT",
      lifetime: 1800,
      url_callback: `${process.env.API_BASE_URL}/api/crypto/crypto-callback`,
      url_return: `${process.env.CLIENT_URL}/payment-success`,
      url_success: `${process.env.CLIENT_URL}/payment-success`,
    };

    console.log("📦 Cryptomus Payload Ready:", payload);

    const MERCHANT_ID = process.env.CRYPTOMUS_MERCHANT_ID;
    const API_KEY = process.env.CRYPTOMUS_API_KEY;

    const base64data = Buffer.from(JSON.stringify(payload)).toString("base64");
    const sign = crypto
      .createHash("md5")
      .update(base64data + API_KEY)
      .digest("hex");

    const headers = {
      merchant: MERCHANT_ID,
      sign,
      "Content-Type": "application/json",
    };

    console.log("🛰️ Sending Request to Cryptomus…");
    const response = await axios.post(
      "https://api.cryptomus.com/v1/payment",
      payload,
      { headers }
    );

    console.log("🟢 Cryptomus Response:", response.data);

   if (response.data?.result?.url) {
  console.log("💾 Saving Payment Record to DB…");

  await pool.query(
    `INSERT INTO crypto_payments 
      (user_id, amount, currency, order_id, payment_status, payment_url)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user_id, amount, currency, orderId, "pending", response.data.result.url]
  );

  console.log("✅ DB Insert Successful for Order:", orderId);

  return res.json({
    success: true,
    payment: {
      result: {
        url: response.data.result.url
      }
    },
    order_id: orderId
  });
}


    console.log("⚠️ Unexpected Cryptomus Response:", response.data);
    return res.status(500).json({
      success: false,
      message: response.data.message || "Payment failed",
    });

  } catch (error) {
    console.error("❌ Payment Error Occurred!");

    if (error.response) {
      console.error("🔴 Cryptomus Error:", error.response.data);
    } else {
      console.error(error);
    }

    return res.status(500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Payment initiation failed. Check logs.",
    });
  }
});

// ✅ Cryptomus Webhook
// ✅ Cryptomus Webhook Callback
router.post("/crypto/crypto-callback", async (req, res) => {
  try {
    console.log("📩 Callback Received:", req.body);

    const { order_id, status, amount, currency } = req.body;

    if (!order_id) {
      return res.json({ success: false });
    }

    const findPayment = await pool.query(
      "SELECT * FROM crypto_payments WHERE order_id = $1",
      [order_id]
    );

    if (findPayment.rows.length === 0) {
      return res.json({ success: false });
    }

    const payment = findPayment.rows[0];

    // ✅ Only accept success status from Cryptomus
    if (status === "paid" || status === "paid_over") {
      console.log("✅ Payment Successful:", order_id);

      await pool.query(
        `UPDATE crypto_payments 
         SET payment_status = 'confirmed', updated_at = NOW()
         WHERE order_id = $1`,
        [order_id]
      );

      await pool.query(
        "UPDATE sign_up SET coin = COALESCE(coin, 0) + $1 WHERE id = $2",
        [amount, payment.user_id]
      );

      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [payment.user_id, `Crypto payment of ${amount} ${currency} confirmed.`]
      );

      return res.json({ success: true });
    }

    // ❌ If Cryptomus returns any failure status
    console.log("❌ Payment Failed:", status);

    await pool.query(
      `UPDATE crypto_payments 
       SET payment_status = 'failed', updated_at = NOW()
       WHERE order_id = $1`,
      [order_id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("❌ Callback Error:", error);
    res.status(500).json({ success: false });
  }
});

router.get("/admin/all-payments", async (req, res) => {
  try {
    console.log("🟢 Fetching all crypto payments...");
    const result = await pool.query(`
      SELECT 
        cp.id,
        cp.user_id,
        s.full_name,
        s.email,
        cp.amount,
        cp.currency,
        cp.network,
        cp.order_id,
        cp.payment_status,
        cp.tx_hash,
        cp.payment_url,
        cp.created_at,
        cp.updated_at
      FROM crypto_payments cp
      LEFT JOIN sign_up s ON cp.user_id = s.id
      ORDER BY cp.created_at DESC
    `);
    res.json({ success: true, payments: result.rows });
  } catch (error) {
    console.error("❌ Error fetching payments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payment data" });
  }
});


module.exports = router;
