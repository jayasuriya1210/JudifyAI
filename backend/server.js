// Import packages
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { getTTSHealth } = require("./src/services/tts/tts");


// PostgreSQL
const pool = require("./src/config/db");

// MinIO
const minioClient = require("./src/config/minio");

// Initialize express
const app = express();

// =====================
// Middleware
// =====================
app.use(cors({
    origin: "*"
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Only keep local folders for temporary PDFs / notes
["uploads/pdf", "notes/pdf"].forEach((dir) => {
    fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
});

// Static folders
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/notes", express.static(path.join(__dirname, "notes")));

// =====================
// Health + Setup
// =====================

// PostgreSQL Health
async function checkPostgres() {
    try {
        const res = await pool.query("SELECT NOW()");
        console.log("✅ PostgreSQL Connected:", res.rows[0].now);
    } catch (err) {
        console.error("❌ PostgreSQL Error:", err.message);
    }
}

// 🔥 NEW: Ensure MinIO bucket exists
async function ensureBucket() {
    try {
        const exists = await minioClient.bucketExists("case-audio");

        if (!exists) {
            await minioClient.makeBucket("case-audio");
            console.log("✅ MinIO bucket created: case-audio");
        } else {
            console.log("✅ MinIO bucket already exists");
        }
    } catch (err) {
        console.error("❌ MinIO Setup Error:", err.message);
        throw err;
    }
}

// =====================
// Routes
// =====================
app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/pdf", require("./src/routes/pdfRoutes"));
app.use("/api/scrape", require("./src/routes/scrapeRoutes"));
app.use("/api/tts", require("./src/routes/ttsRoutes"));
app.use("/api/history", require("./src/routes/historyRoutes"));
app.use("/api/summary", require("./src/routes/summaryRoutes"));
app.use("/api/notes", require("./src/routes/notesRoutes"));
app.use("/api/cases", require("./src/routes/caseRoutes"));
app.use("/api/workflow", require("./src/routes/workflowRoutes"));

// Default route
app.get("/", (req, res) => {
    res.json({
        message: "CaseLaw Audio Intelligence Platform API Running (PostgreSQL + MinIO)"
    });
});

// =====================
// Start Server (UPDATED)
// =====================
const PORT = 5000;

async function startServer() {
    try {
        // 🔥 Step 1: Ensure MinIO bucket exists
        await ensureBucket();

        // 🔥 Step 2: Start server
        app.listen(PORT, async () => {
            console.log(`🚀 Server running on port: ${PORT}`);

            // Check DB
            await checkPostgres();

            // TTS Health
            try {
                const health = await getTTSHealth();
                const piper = health.piper;

                console.log(
                    `[TTS] Piper enabled=${piper.enabled} ready=${piper.ready}; Edge ready=${health.edge.ready}`
                );

                if (piper.error) console.log(`[TTS] Piper: ${piper.error}`);
            } catch (error) {
                console.log(`[TTS] health check failed: ${error.message}`);
            }
        });

    } catch (err) {
        console.error("❌ Server failed to start:", err.message);
    }
}

// 🔥 Start everything
startServer();
