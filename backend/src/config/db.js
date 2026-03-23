const { Pool } = require("pg");

const portFromEnv = Number(process.env.DB_PORT);
const resolvedPort = Number.isFinite(portFromEnv) ? portFromEnv : 5432;

const pool = new Pool({
  user: process.env.DB_USER || "judifyadmin",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "casesdb",
  password: process.env.DB_PASSWORD || "casejudify2026",
  port: resolvedPort,
});

pool.on("connect", () => {
  console.log(`✅ PostgreSQL Connected (${pool.options.host}:${pool.options.port})`);
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL Error:", err);
});

module.exports = pool;
