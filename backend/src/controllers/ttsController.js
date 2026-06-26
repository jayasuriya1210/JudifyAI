const { createHash } = require("crypto");
const axios = require("axios");
const { generateTTS, getTTSHealth } = require("../services/tts/tts");
const Audio = require("../models/audioModel");
const History = require("../models/historyModel");
const Case = require("../models/caseModel");
const Summary = require("../models/summaryModel");
const { buildSummaryNarration, normalizeSummaryText, splitNarrationChunks } = require("../services/summary/summaryNarration");
const upstashRedis = require("../services/cache/upstashRedis");

const SUMMARY_CHUNK_CHARS = Math.max(350, Number(process.env.TTS_SUMMARY_CHUNK_CHARS || 1100));
const SUMMARY_CACHE_TTL_SECONDS = Math.max(120, Number(process.env.TTS_SUMMARY_CACHE_TTL_SECONDS || 14400));

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function toPositiveInt(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
}

function toSummaryShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    background: row.background,
    legalIssues: row.legal_issues,
    arguments: row.arguments,
    courtReasoning: row.court_reasoning,
    judgmentOutcome: row.judgment_outcome,
    fullText: row.full_summary,
  };
}

function buildNarrationCacheKey({ userId, summaryId, caseId, requestText }) {
  if (summaryId) return `judify:tts:narration:v2:u${userId}:s${summaryId}`;
  if (caseId && requestText) {
    const hash = createHash("sha1").update(requestText).digest("hex");
    return `judify:tts:narration:v2:u${userId}:c${caseId}:h${hash}`;
  }
  if (caseId) return `judify:tts:narration:v2:u${userId}:c${caseId}`;
  if (requestText) {
    const hash = createHash("sha1").update(requestText).digest("hex");
    return `judify:tts:narration:v2:u${userId}:h${hash}`;
  }
  return "";
}

async function resolveNarrationPayload({ userId, caseId, summaryId, requestText }) {
  const cleanRequestText = normalizeSummaryText(requestText);
  const cacheKey = buildNarrationCacheKey({
    userId,
    summaryId,
    caseId,
    requestText: cleanRequestText,
  });

  if (cacheKey && upstashRedis.isEnabled()) {
    const cached = await upstashRedis.getJSON(cacheKey);
    if (cached?.text) {
      return {
        text: String(cached.text),
        source: String(cached.source || "summary"),
        inputChunkCount: Number(cached.inputChunkCount || 1),
        caseId: toPositiveInt(cached.caseId) || caseId || null,
        summaryId: toPositiveInt(cached.summaryId) || summaryId || null,
        cacheHit: true,
      };
    }
  }

  let summaryRow = null;
  if (summaryId) {
    summaryRow = await Summary.findById(userId, summaryId);
  }
  if (!summaryRow && caseId) {
    summaryRow = await Summary.latestByCase(userId, caseId);
  }

  const summaryShape = toSummaryShape(summaryRow);
  const summaryNarration = summaryShape ? buildSummaryNarration(summaryShape) : "";
  const narrationBase = summaryNarration || cleanRequestText;

  if (!narrationBase) {
    return {
      error: "Summary not found. Generate summary first, then synthesize audio.",
      status: 404,
    };
  }

  const chunks = splitNarrationChunks(narrationBase, SUMMARY_CHUNK_CHARS);
  const narrationText = chunks.join("\n\n");
  const payload = {
    text: narrationText,
    source: summaryShape ? "summary" : "request",
    inputChunkCount: chunks.length || 1,
    caseId: toPositiveInt(summaryShape?.caseId) || caseId || null,
    summaryId: toPositiveInt(summaryShape?.id) || summaryId || null,
    cacheHit: false,
  };

  if (cacheKey && upstashRedis.isEnabled()) {
    await upstashRedis.setJSON(cacheKey, payload, SUMMARY_CACHE_TTL_SECONDS);
  }

  return payload;
}

exports.textToAudio = async (req, res) => {
  try {
    const { text, lang, case_id, summary_id, case_title, source_url, pdf_url } = req.body;
    const parsedCaseId = toPositiveInt(case_id);
    const parsedSummaryId = toPositiveInt(summary_id);
    const requestText = normalizeSummaryText(text);

    if (!parsedCaseId && !parsedSummaryId && !requestText) {
      return res.status(400).json({ msg: "Provide summary_id, case_id, or summary text." });
    }

    const narration = await resolveNarrationPayload({
      userId: req.user.id,
      caseId: parsedCaseId,
      summaryId: parsedSummaryId,
      requestText,
    });

    if (narration.error) {
      return res.status(narration.status || 400).json({ msg: narration.error });
    }

    let resolvedCaseId = toPositiveInt(narration.caseId) || parsedCaseId;
    let caseRecord = resolvedCaseId ? await Case.findById(resolvedCaseId, req.user.id) : null;

    if (resolvedCaseId && !caseRecord) {
      return res.status(404).json({ msg: "Case not found" });
    }

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
      return res.status(500).json({ msg: "Unable to resolve case for audio generation" });
    }

    const textForTTS = narration.text;
    const tts = await generateTTS(textForTTS, {
      sourceWordCount: countWords(textForTTS),
      language: lang || "en",
    });

    const audioURL = tts.audioURL;
    const audioURLs = tts.audioURLs;
    const ttsProvider = tts.provider || "unknown";
    const language = lang || "en";
    const resolvedSummaryId = toPositiveInt(narration.summaryId) || parsedSummaryId || null;

    const audioId = await Audio.save({
      user_id: req.user.id,
      case_id: resolvedCaseId,
      summary_id: resolvedSummaryId,
      language,
      audio_url: audioURL,
      audio_urls: audioURLs,
    });

    await History.add(req.user.id, resolvedCaseId, case_title || caseRecord.title || "Untitled case", language);

    return res.json({
      audioId,
      caseId: resolvedCaseId,
      summaryId: resolvedSummaryId,
      audioURL,
      audioURLs,
      ttsProvider,
      language,
      narrationSource: narration.source,
      narrationChunkCount: narration.inputChunkCount,
      cacheHit: narration.cacheHit,
      ttsChunkCount: Number(tts.chunkCount || 1),
    });
  } catch (error) {
    return res.status(500).json({ msg: error.message || "Audio generation failed" });
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

    res.setHeader("Content-Type", response.headers["content-type"] || "audio/mpeg");
    response.data.pipe(res);
  } catch (_error) {
    return res.status(502).json({ msg: "Failed to stream audio" });
  }
};

exports.health = async (_req, res) => {
  try {
    const health = await getTTSHealth();
    const ok = Boolean(
      (health.piper.enabled && health.piper.ready)
      || health.edge.ready
    );
    return res.status(ok ? 200 : 503).json(health);
  } catch (error) {
    return res.status(500).json({ msg: error.message || "Failed to get TTS health" });
  }
};
