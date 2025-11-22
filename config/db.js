// // config/db.js
// const { Pool } = require("pg");
// require("dotenv").config();

// const isProduction = process.env.NODE_ENV === "production";

// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASSWORD,
//   port: process.env.DB_PORT,
//   ssl: isProduction ? { rejectUnauthorized: false } : false,
// });

// pool.connect()
//   .then(() => console.log("✅ Connected to PostgreSQL"))
//   .catch(err => console.error("❌ DB Connection Error:", err));

// module.exports = pool;

const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

console.log("📌 ENV VALUES:");
console.log(" DB_HOST =", process.env.DB_HOST);
console.log(" DB_USER =", process.env.DB_USER);
console.log(" DB_NAME =", process.env.DB_NAME);
console.log(" DB_PORT =", process.env.DB_PORT);
console.log(" NODE_ENV =", process.env.NODE_ENV);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ DB Connection Error:", err));

module.exports = pool;
