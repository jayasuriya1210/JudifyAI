const { summarizeText } = require("../services/summary/summarize");
const { generateTTS } = require("../services/tts/tts");
const Summary = require("../models/summaryModel");
const Audio = require("../models/audioModel");
const History = require("../models/historyModel");
const Case = require("../models/caseModel");
const { buildSummaryNarration } = require("../services/summary/summaryNarration");

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

exports.generateRealtime = async (req, res) => {
  try {
    const { text, case_id, lang, case_title } = req.body;
    const caseId = Number(case_id);

    if (!text || !text.trim()) {
      return res.status(400).json({ msg: "text is required" });
    }
    if (!caseId) {
      return res.status(400).json({ msg: "case_id is required" });
    }

    const caseRecord = await Case.findById(caseId, req.user.id);
    if (!caseRecord) {
      return res.status(404).json({ msg: "Case not found" });
    }

    const summary = await summarizeText(text);
    const summaryId = await Summary.save(req.user.id, caseId, summary);

    const language = lang || "en";
    let audioURL = "";
    let audioURLs = [];
    let audioId = null;
    let audioError = "";
    let ttsProvider = "";
    try {
      const ttsText = buildSummaryNarration(summary) || summary.fullText || text;
      const tts = await generateTTS(ttsText, {
        sourceWordCount: countWords(ttsText),
        language,
      });
      audioURL = tts.audioURL;
      audioURLs = tts.audioURLs || [];
      ttsProvider = tts.provider || "unknown";
      audioId = await Audio.save({
        user_id: req.user.id,
        case_id: caseId,
        summary_id: summaryId,
        language,
        audio_url: audioURL,
        audio_urls: audioURLs,
      });
      await History.add(
        req.user.id,
        caseId,
        case_title || caseRecord.title || "Untitled case",
        language
      );
    } catch (err) {
      audioError = err?.message || "Audio generation failed";
    }

    return res.json({
      caseId,
      summaryId,
      summary,
      audioId,
      audioURL,
      audioURLs,
      ttsProvider,
      language,
      audioError,
    });
  } catch (error) {
    return res.status(500).json({ msg: error.message || "Realtime workflow failed" });
  }
};
