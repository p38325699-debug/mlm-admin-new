// backend/routes/walletRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const multer = require('multer');
const axios = require("axios");

// Configure multer for memory storage (for bytea)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => { 
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ✅ Get screenshot by wallet ID
router.get("/wallet/:id/screenshot", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT screenshot FROM wallet WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].screenshot) {
      return res.status(404).json({ success: false, message: "Screenshot not found" });
    }

    const screenshot = result.rows[0].screenshot;
    
    // Set appropriate headers for image response
    res.setHeader('Content-Type', 'image/jpeg'); // Adjust based on your image type
    res.setHeader('Content-Length', screenshot.length);
    res.send(screenshot);
  } catch (err) {
    console.error("💥 Get Screenshot Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Updated wallet top-up with screenshot upload - FIXED VERSION
// router.post("/wallet-topup", upload.single('screenshot'), async (req, res) => {
//   let client;
//   try {
//     console.log("🟡 Wallet top-up request received");
//     console.log("🟡 Request body:", req.body);
//     console.log("🟡 File received:", req.file ? `Yes - ${req.file.originalname}` : 'No');

//     const { user_id, amount, method, utr_number } = req.body;
    
//   if (method && method.toUpperCase() === "CRYPTO" && parseFloat(amount) < 6) {
//     return res.status(400).json({
//       success: false,
//       message: "Minimum crypto top-up amount is $6"
//     });
//   }

//     const screenshot = req.file ? req.file.buffer : null;

//     // Validate required fields
//     if (!user_id || !amount || !method) {
//       console.log("❌ Missing required fields");
//       return res.status(400).json({ 
//         success: false, 
//         message: "Missing required fields: user_id, amount, method" 
//       });
//     }

//     // Get a client from the pool for transaction
//     client = await pool.connect();

//     // Start transaction
//     await client.query('BEGIN');

//     // 🧠 Get user trust and coin
//     const userRes = await client.query(
//       "SELECT trust, coin FROM sign_up WHERE id = $1", 
//       [user_id]
//     );
    
//     if (userRes.rows.length === 0) {
//       await client.query('ROLLBACK');
//       return res.status(404).json({ 
//         success: false, 
//         message: "User not found" 
//       });
//     }

//     const user = userRes.rows[0];
//     let dueValue = false;
//     let status = 'pending';

//     // 🟢 If trusted → auto-add to coin & mark due true
//     if (user.trust === true) {
//       await client.query(
//         "UPDATE sign_up SET coin = coin + $1 WHERE id = $2", 
//         [parseFloat(amount), user_id]
//       );
//       dueValue = true;
//       status = 'completed';
//     }

//     // 🧾 Insert into wallet table with screenshot
//     const validMethods = ["UPI", "SCANNER", "CRYPTO"];
//     const paymentMethod = validMethods.includes(method.toUpperCase())
//       ? method.toUpperCase()
//       : "UNKNOWN";

//     console.log("🟡 Inserting wallet record...");
    
//     const insertRes = await client.query(
//       `INSERT INTO wallet (user_id, amount, method, utr_number, screenshot, due, status)
//        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
//       [
//         user_id, 
//         parseFloat(amount), 
//         paymentMethod, 
//         utr_number, 
//         screenshot, 
//         dueValue,
//         status
//       ]
//     );

//     // ✅ If due is true → add notification
//     if (dueValue) {
//       await client.query(
//         "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
//         [user_id, `Wallet top-up of $${amount} approved and added to your balance.`]
//       );
//     }

//     // Commit transaction
//     await client.query('COMMIT');

//     console.log("✅ Wallet top-up successful");

//     res.json({
//       success: true,
//       message: `Wallet top-up of $${amount} ${dueValue ? 'completed' : 'submitted for approval'}.`,
//       wallet_id: insertRes.rows[0].id,
//       due: dueValue,
//       status: status
//     });

//   } catch (err) {
//     // Rollback transaction in case of error
//     if (client) {
//       await client.query('ROLLBACK');
//     }
    
//     console.error("💥 Wallet Top-up Error:", err.message);
//     console.error("💥 Error stack:", err.stack);
    
//     res.status(500).json({ 
//       success: false, 
//       message: "Server error during wallet top-up",
//       error: process.env.NODE_ENV === 'development' ? err.message : undefined
//     });
//   } finally {
//     // Release client back to pool
//     if (client) {
//       client.release();
//     } 
//   }
// });

// ✅ Updated wallet top-up with screenshot upload - FIXED VERSION
router.post("/wallet-topup", upload.single('screenshot'), async (req, res) => {
  let client;
  try {
    console.log("🟡 Wallet top-up request received");
    console.log("🟡 Request body:", req.body);
    console.log("🟡 File received:", req.file ? `Yes - ${req.file.originalname}` : 'No');

    const { user_id, amount, method, utr_number } = req.body;
    
    if (method && method.toUpperCase() === "CRYPTO" && parseFloat(amount) < 6) {
      return res.status(400).json({
        success: false,
        message: "Minimum crypto top-up amount is $6"
      });
    }

    // 🔴 ADDED: Validate UTR number for UPI and SCANNER methods
    if (method && (method.toUpperCase() === "UPI" || method.toUpperCase() === "SCANNER")) {
      if (!utr_number || utr_number.trim() === '') {
        return res.status(400).json({
          success: false,
          message: "UTR/Transaction ID is required for UPI and QR payments"
        });
      }
      
      // 🔴 ADDED: Check if UTR number already exists to prevent duplicates
      const existingUtr = await pool.query(
        "SELECT id FROM wallet WHERE utr_number = $1 AND status != 'rejected'",
        [utr_number.trim()]
      );
      
      if (existingUtr.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: "This UTR/Transaction ID has already been used"
        });
      }
    }

    const screenshot = req.file ? req.file.buffer : null;

    // Validate required fields
    if (!user_id || !amount || !method) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: user_id, amount, method" 
      });
    }

    // 🔴 ADDED: For UPI and SCANNER methods, screenshot is required
    if ((method.toUpperCase() === "UPI" || method.toUpperCase() === "SCANNER") && !screenshot) {
      return res.status(400).json({
        success: false,
        message: "Payment screenshot is required for UPI and QR payments"
      });
    }

    // Get a client from the pool for transaction
    client = await pool.connect();

    // Start transaction
    await client.query('BEGIN');

    // 🧠 Get user trust and coin
    const userRes = await client.query(
      "SELECT trust, coin FROM sign_up WHERE id = $1", 
      [user_id]
    );
    
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    const user = userRes.rows[0];
    let dueValue = false;
    let status = 'pending';

    // 🟢 If trusted → auto-add to coin & mark due true
    if (user.trust === true) {
      await client.query(
        "UPDATE sign_up SET coin = coin + $1 WHERE id = $2", 
        [parseFloat(amount), user_id]
      );
      dueValue = true;
      status = 'completed';
    }

    // 🧾 Insert into wallet table with screenshot
    const validMethods = ["UPI", "SCANNER", "CRYPTO"];
    const paymentMethod = validMethods.includes(method.toUpperCase())
      ? method.toUpperCase()
      : "UNKNOWN";

    console.log("🟡 Inserting wallet record...");
    
    const insertRes = await client.query(
      `INSERT INTO wallet (user_id, amount, method, utr_number, screenshot, due, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        user_id, 
        parseFloat(amount), 
        paymentMethod, 
        utr_number, 
        screenshot, 
        dueValue,
        status
      ]
    );

    // ✅ If due is true → add notification
    if (dueValue) {
      await client.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `Wallet top-up of $${amount} approved and added to your balance.`]
      );
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log("✅ Wallet top-up successful");

    res.json({
      success: true,
      message: `Wallet top-up of $${amount} ${dueValue ? 'completed' : 'submitted for approval'}.`,
      wallet_id: insertRes.rows[0].id,
      due: dueValue,
      status: status
    });

  } catch (err) {
    // Rollback transaction in case of error
    if (client) {
      await client.query('ROLLBACK');
    }
    
    console.error("💥 Wallet Top-up Error:", err.message);
    console.error("💥 Error stack:", err.stack);
    
    res.status(500).json({ 
      success: false, 
      message: "Server error during wallet top-up",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    // Release client back to pool
    if (client) {
      client.release();
    } 
  }
});

// ✅ Check if UTR number already exists
router.get("/check-utr/:utr_number", async (req, res) => {
  try {
    const { utr_number } = req.params;
    
    const result = await pool.query(
      "SELECT id, status FROM wallet WHERE utr_number = $1",
      [utr_number.trim()]
    );

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        exists: true,
        status: result.rows[0].status,
        message: "This UTR/Transaction ID has already been used"
      });
    }

    res.json({
      success: true,
      exists: false,
      message: "UTR number is available"
    });
  } catch (err) {
    console.error("💥 Check UTR Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Admin updates wallet due → auto notification and coin update
router.put("/wallet-due/:id", async (req, res) => {
  try {
    const walletId = req.params.id;
    const { due } = req.body;

    // 🧠 Update wallet due + status
const result = await pool.query(
  `UPDATE wallet 
   SET due = $1, 
       status = CASE WHEN $1 = true THEN 'completed' ELSE status END 
   WHERE id = $2 
   RETURNING user_id, amount`,
  [due, walletId]
);


    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Wallet record not found" });
    }

    const { user_id, amount } = result.rows[0];

    if (due === true) {
      // 🟢 Add to user balance
      await pool.query("UPDATE sign_up SET coin = coin + $1 WHERE id = $2", [amount, user_id]);

      // 🟢 Notify user
      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `Wallet top-up of $${amount} has been approved.`]
      );
    }

    res.json({ success: true, message: "Wallet due status updated successfully" });
  } catch (err) {
    console.error("💥 Wallet Due Update Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Fetch all wallet records (Admin side)
router.get("/wallet/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.*, 
        s.full_name, 
        s.email
      FROM wallet w
      JOIN sign_up s ON w.user_id = s.id
      ORDER BY w.payment_date DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("💥 Fetch All Wallet Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ✅ Fetch wallet records for specific user
// router.get("/wallet/user/:userId", async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const result = await pool.query(
//       `SELECT * FROM wallet WHERE user_id = $1 ORDER BY payment_date DESC`,
//       [userId]
//     );

//     if (result.rows.length === 0) {
//       return res.json({ success: true, data: [], message: "No wallet records found" });
//     }

//     res.json({ success: true, data: result.rows });
//   } catch (err) {
//     console.error("💥 Fetch Wallet by User Error:", err.message);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// ✅ Fetch wallet records for specific user (INCLUDE BOTH WALLET & CRYPTO PAYMENTS)
router.get("/wallet/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get regular wallet transactions
    const walletResult = await pool.query(
      `SELECT 
        id, user_id, amount, method, utr_number, due, status, 
        payment_date as created_at, 'wallet' as type, NULL as payment_status,
        NULL as currency, NULL as network, NULL as tx_hash, NULL as order_id
       FROM wallet 
       WHERE user_id = $1`,
      [userId]
    );

    // Get crypto payments - FIX: Use payment_status as status for consistency
    const cryptoResult = await pool.query(
      `SELECT 
        id, user_id, amount, 'CRYPTO' as method, NULL as utr_number,
        NULL as due, payment_status as status, created_at,
        'crypto_payment' as type, payment_status,
        currency, network, tx_hash, order_id
       FROM crypto_payments 
       WHERE user_id = $1`,
      [userId]
    );

    // Combine both results
    const combinedData = [
      ...walletResult.rows,
      ...cryptoResult.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (combinedData.length === 0) {
      return res.json({ success: true, data: [], message: "No wallet records found" });
    }

    res.json({ success: true, data: combinedData });
  } catch (err) {
    console.error("💥 Fetch Wallet by User Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/wallet-withdrawal
router.post("/wallet-withdrawal", async (req, res) => {
  try {
    const {
  user_id,
  amount,
  message,
  method,
  upi_address,
  bank_holder_name,
  bank_name,
  ifsc_code,
  crypto_address,
  crypto_network
} = req.body;


    if (!user_id || !amount) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (amount < 50) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is $50" });
    }

   const result = await pool.query(
  `INSERT INTO wallet_withdrawals 
   (user_id, amount, message, method, upi_address, bank_holder_name, bank_name, ifsc_code, crypto_address, crypto_network)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   RETURNING *`,
  [user_id, amount, message || null, method || 'UPI', upi_address || null, bank_holder_name || null,
   bank_name || null, ifsc_code || null, crypto_address || null, crypto_network || 'BEP20']
);


    res.json({ success: true, data: result.rows[0], message: "Withdrawal request submitted successfully" });
  } catch (err) {
    console.error("💥 Wallet Withdrawal Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ✅ Get current wallet balance
router.get("/user/:userId/balance", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      "SELECT coin FROM sign_up WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, balance: result.rows[0].coin });
  } catch (err) {
    console.error("💥 Fetch Wallet Balance Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/wallet-withdrawals/:userId
router.get("/wallet-withdrawals/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT * FROM wallet_withdrawals WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("💥 Fetch Withdrawals Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Admin: Fetch all withdrawal requests (UPI / Bank / Crypto)
router.get("/withdrawals/all", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.id,
        w.user_id,
        s.full_name,
        s.email,
        w.amount,
        w.message,
        w.method,
        w.status,
        w.created_at,

        -- Optional fields depending on method
        w.upi_address,
        w.bank_holder_name,
        w.bank_name,
        w.ifsc_code,
        w.crypto_address,
        w.crypto_network

      FROM wallet_withdrawals w
      JOIN sign_up s ON w.user_id = s.id
      ORDER BY w.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("💥 Fetch All Withdrawals Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Check if user has pending withdrawal
router.get("/withdrawals/check-pending/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      "SELECT COUNT(*) as pending_count FROM wallet_withdrawals WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );

    const hasPending = parseInt(result.rows[0].pending_count) > 0;
    
    res.json({ 
      success: true, 
      hasPending: hasPending,
      pendingCount: parseInt(result.rows[0].pending_count)
    });
  } catch (err) {
    console.error("💥 Check Pending Withdrawals Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Admin: Update withdrawal status
router.put("/withdrawals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // ✅ Validate status value
    if (!["pending", "completed", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    // ✅ Fetch withdrawal details
    const withdrawalRes = await pool.query(
      "SELECT user_id, amount, status FROM wallet_withdrawals WHERE id = $1",
      [id]
    );

    if (withdrawalRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }

    const { user_id, amount, status: currentStatus } = withdrawalRes.rows[0];

    // ✅ Prevent double processing
    if (currentStatus === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "This withdrawal is already marked as completed." });
    }

    // ✅ Update withdrawal status
    await pool.query("UPDATE wallet_withdrawals SET status = $1 WHERE id = $2", [status, id]);

    if (status === "completed") {
      // 🟢 Deduct amount from user's wallet
      await pool.query("UPDATE sign_up SET coin = coin - $1 WHERE id = $2", [amount, user_id]);

      // 🟢 Insert notification
      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `${amount} amount has been sent successfully for withdrawal.`]
      );
    }

    if (status === "rejected") {
      await pool.query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
        [user_id, `Your withdrawal request of ${amount} was rejected.`]
      );
    }

    res.json({ success: true, message: "Withdrawal status updated successfully." });
  } catch (err) {
    console.error("💥 Withdrawal Update Error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
