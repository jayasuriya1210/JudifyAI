const { summarizeText } = require("../services/summary/summarize");
const Summary = require("../models/summaryModel");
const Case = require("../models/caseModel");
const { buildSummaryNarration } = require("../services/summary/summaryNarration");

exports.summarize = async (req, res) => {
  try {
    const { text } = req.body;
    const caseId = Number(req.body.case_id);
    if (!text || !text.trim()) {
      return res.status(400).json({ msg: "text is required" });
    }
    if (!caseId) {
      return res.status(400).json({ msg: "case_id is required" });
    }

    const summary = await summarizeText(text);
    const existingCase = await Case.findById(caseId, req.user.id);
    if (!existingCase) {
      return res.status(404).json({ msg: "Case not found" });
    }

    const summaryId = await Summary.save(req.user.id, caseId, summary);
    return res.json({ caseId, summaryId, summary });
  } catch (error) {
    return res.status(500).json({ msg: "Summary generation failed" });
  }
};

exports.getLatestSummary = async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const row = await Summary.latestByCase(req.user.id, caseId);
    if (!row) return res.status(404).json({ msg: "Summary not found" });

    return res.json({
      id: row.id,
      caseId: row.case_id,
      summary: {
        background: row.background,
        legalIssues: row.legal_issues,
        arguments: row.arguments,
        courtReasoning: row.court_reasoning,
        judgmentOutcome: row.judgment_outcome,
        fullText: row.full_summary,
        audioText: buildSummaryNarration(row),
      },
      createdAt: row.created_at,
    });
  } catch (error) {
    return res.status(500).json({ msg: "Failed to load summary" });
  }
};
