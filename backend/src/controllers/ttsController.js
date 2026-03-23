const { generateTTS, getTTSHealth } = require("../services/tts/tts");
const History = require("../models/historyModel");
const Case = require("../models/caseModel");
const axios = require("axios");

// NEW
const minioClient = require("../config/minio");
const pool = require("../config/db");

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

exports.textToAudio = async (req, res) => {
  try {
    const { text, lang, case_id, summary_id, case_title, source_url, pdf_url } = req.body;

    const parsedCaseId = Number(case_id);

    if (!text || !text.trim()) {
      return res.status(400).json({ msg: "text is required" });
    }

    // 🔹 Resolve Case
    let resolvedCaseId =
      Number.isFinite(parsedCaseId) && parsedCaseId > 0 ? parsedCaseId : null;

    let caseRecord = resolvedCaseId
      ? await Case.findById(resolvedCaseId, req.user.id)
      : null;

    if (!caseRecord) {
      resolvedCaseId = await Case.createFromSearch({
        user_id: req.user.id,
        title: case_title || "Untitled case",
        source_url: source_url || null,
        pdf_url: pdf_url || null,
      });

      caseRecord = await Case.findById(resolvedCaseId, req.user.id);
    }

    if (!caseRecord || !resolvedCaseId) {
      return res
        .status(500)
        .json({ msg: "Unable to resolve case for audio generation" });
    }

    // 🔹 Text selection logic
    const requestText = String(text || "").trim();
    const extractedText = String(caseRecord?.extracted_text || "").trim();

    const sourceWordCount = countWords(extractedText || requestText);
    const requestWordCount = countWords(requestText);

    const shouldUseExtracted =
      extractedText &&
      sourceWordCount >= 300 &&
      requestWordCount <
        Math.max(220, Math.floor(sourceWordCount * 0.35));

    const textForTTS = shouldUseExtracted
      ? extractedText
      : requestText;

    // 🔥 Generate TTS
    const tts = await generateTTS(textForTTS, { sourceWordCount });

    const audioURL = tts.audioURL;
    const ttsProvider = tts.provider || "unknown";
    const language = lang || "en";

    // 🔥 STEP 1: Download audio
    const response = await axios.get(audioURL, {
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(response.data);

    // 🔥 STEP 2: Upload to MinIO
    const BUCKET = "case-audio";
    const objectName = `audio_${Date.now()}.mp3`;

    await minioClient.putObject(
      BUCKET,
      objectName,
      audioBuffer,
      audioBuffer.length,
      { "Content-Type": "audio/mpeg" }
    );

    // 🔥 STEP 3: Save in PostgreSQL
    const dbResult = await pool.query(
      `INSERT INTO audio_records 
      (user_id, case_id, summary_id, language, minio_bucket, minio_object_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        req.user.id,
        resolvedCaseId,
        summary_id ? Number(summary_id) : null,
        language,
        BUCKET,
        objectName,
      ]
    );

    const audioId = dbResult.rows[0].id;

    // 🔥 STEP 4: Generate secure URL
    const presignedUrl = await minioClient.presignedGetObject(
      BUCKET,
      objectName,
      24 * 60 * 60 // 24 hrs
    );

    // 🔹 History tracking
    await History.add(
      req.user.id,
      resolvedCaseId,
      case_title || caseRecord.title || "Untitled case",
      language
    );

    // 🔥 FINAL RESPONSE
    return res.json({
      audioId,
      caseId: resolvedCaseId,
      audioURL: presignedUrl,
      ttsProvider,
      language,
    });
  } catch (error) {
    console.error("❌ TTS ERROR:", error);
    return res
      .status(500)
      .json({ msg: error.message || "Audio generation failed" });
  }
};

exports.proxyAudio = async (req, res) => {
  try {
    const raw = String(req.query.u || "").trim();
    if (!raw) return res.status(400).json({ msg: "u is required" });

    let url;
    try {
      url = new URL(raw);
    } catch (_error) {
      return res.status(400).json({ msg: "Invalid URL" });
    }

    if (url.protocol !== "https:" || !/\.?google\.com$/i.test(url.hostname)) {
      return res.status(400).json({ msg: "URL is not allowed" });
    }

    const response = await axios.get(url.toString(), {
      responseType: "stream",
      timeout: 12000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "audio/mpeg"
    );

    response.data.pipe(res);
  } catch (_error) {
    return res.status(502).json({ msg: "Failed to stream audio" });
  }
};

exports.health = async (_req, res) => {
  try {
    const health = await getTTSHealth();

    const ok = Boolean(
      (health.piper.enabled && health.piper.ready) ||
        health.edge.ready
    );

    return res.status(ok ? 200 : 503).json(health);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: error.message || "Failed to get TTS health" });
  }
};