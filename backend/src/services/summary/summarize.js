const { callLLM } = require("../ai/llm");
const { buildSummaryNarration, normalizeSummaryText } = require("./summaryNarration");

const SUMMARY_FULLTEXT_MAX_CHARS = Math.max(800, Number(process.env.SUMMARY_FULLTEXT_MAX_CHARS || 4200));

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return normalize(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clampText(text, maxChars) {
  const clean = normalize(text);
  if (clean.length <= maxChars) return clean;
  const sliced = clean.slice(0, maxChars);
  const lastSentence = Math.max(sliced.lastIndexOf("."), sliced.lastIndexOf("?"), sliced.lastIndexOf("!"));
  if (lastSentence > 500) return sliced.slice(0, lastSentence + 1);
  return sliced;
}

function uniqueSentences(sentences, maxCount = 6) {
  const seen = new Set();
  const out = [];
  for (const line of sentences) {
    const key = line.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= maxCount) break;
  }
  return out;
}

function selectByKeywords(sentences, keywords, maxCount = 6) {
  const subset = sentences.filter((line) => {
    const lower = line.toLowerCase();
    return keywords.some((key) => lower.includes(key));
  });
  return uniqueSentences(subset, maxCount);
}

function buildAnalysisInput(sourceText) {
  const clean = normalize(sourceText);
  if (!clean) return "";
  if (clean.length <= 12000) return clean;

  const sentences = splitSentences(clean);
  const first = sentences.slice(0, 30);
  const last = sentences.slice(-20);
  const issues = selectByKeywords(sentences, ["issue", "whether", "question before", "challenge"], 10);
  const arguments = selectByKeywords(sentences, ["argued", "submitted", "contended", "counsel", "petitioner", "respondent"], 12);
  const reasoning = selectByKeywords(sentences, ["held", "observed", "reason", "finding", "analysis", "because"], 14);
  const outcome = selectByKeywords(sentences, ["dismissed", "allowed", "upheld", "set aside", "acquitted", "convicted", "order"], 8);

  const merged = uniqueSentences([...first, ...issues, ...arguments, ...reasoning, ...outcome, ...last], 110);
  return clampText(merged.join(" "), 13000);
}

function fallbackSummary(text) {
  const source = normalize(text);
  if (!source) {
    return {
      background: "",
      legalIssues: "",
      arguments: "",
      courtReasoning: "",
      judgmentOutcome: "",
      fullText: "",
      audioText: "",
    };
  }

  const sentences = splitSentences(source);
  const background = uniqueSentences(sentences.slice(0, 12), 6).join(" ");
  const legalIssues = selectByKeywords(sentences, ["issue", "whether", "question", "challenge"], 6).join(" ");
  const arguments = selectByKeywords(sentences, ["argued", "submitted", "contended", "petitioner", "respondent"], 7).join(" ");
  const courtReasoning = selectByKeywords(sentences, ["held", "observed", "reason", "finding", "analysis"], 7).join(" ");
  const judgmentOutcome = selectByKeywords(
    sentences,
    ["dismissed", "allowed", "upheld", "set aside", "acquitted", "convicted", "order", "relief"],
    5
  ).join(" ");

  const stitchedSummary = clampText(
    [
      background,
      legalIssues,
      arguments,
      courtReasoning,
      judgmentOutcome,
      uniqueSentences(sentences.slice(0, 12), 6).join(" "),
    ]
      .map((value) => normalizeSummaryText(value))
      .filter(Boolean)
      .join(" "),
    SUMMARY_FULLTEXT_MAX_CHARS
  );

  const audioText = buildSummaryNarration({
    background: background || "Background extracted from judgment.",
    legalIssues: legalIssues || "Legal issues identified from case context.",
    arguments: arguments || "Arguments inferred from petitioner and respondent statements.",
    courtReasoning: courtReasoning || "Court reasoning identified from key findings.",
    judgmentOutcome: judgmentOutcome || "Final outcome identified from decision section.",
    fullText: stitchedSummary,
  });

  return {
    background,
    legalIssues,
    arguments,
    courtReasoning,
    judgmentOutcome,
    fullText: stitchedSummary,
    audioText,
  };
}

function sanitizeSummary(parsed, sourceText, fallback) {
  const background = String(parsed.background || "").trim() || fallback.background;
  const legalIssues = String(parsed.legalIssues || "").trim() || fallback.legalIssues;
  const argumentsText = String(parsed.arguments || "").trim() || fallback.arguments;
  const courtReasoning = String(parsed.courtReasoning || "").trim() || fallback.courtReasoning;
  const judgmentOutcome = String(parsed.judgmentOutcome || "").trim() || fallback.judgmentOutcome;

  const stitchedSummary = clampText(
    normalizeSummaryText(parsed.fullText)
      || normalizeSummaryText(
        [background, legalIssues, argumentsText, courtReasoning, judgmentOutcome]
          .filter(Boolean)
          .join(" ")
      )
      || fallback.fullText,
    SUMMARY_FULLTEXT_MAX_CHARS
  );

  const audioText = buildSummaryNarration({
    background,
    legalIssues,
    arguments: argumentsText,
    courtReasoning,
    judgmentOutcome,
    fullText: stitchedSummary,
  });

  return {
    background,
    legalIssues,
    arguments: argumentsText,
    courtReasoning,
    judgmentOutcome,
    fullText: stitchedSummary || normalize(sourceText),
    audioText: audioText || fallback.audioText,
  };
}

async function summarizeText(text) {
  const sourceText = normalize(text);
  const fallback = fallbackSummary(sourceText);
  if (!sourceText) return fallback;

  const analysisInput = buildAnalysisInput(sourceText);
  try {
    const content = await callLLM({
      system: [
        "You are a legal analyst.",
        "Return STRICT JSON with keys only: background, legalIssues, arguments, courtReasoning, judgmentOutcome, fullText.",
        "Accuracy rules:",
        "1) Do not invent facts.",
        "2) Preserve legal meaning and outcome.",
        "3) Mention both sides' arguments if present.",
        "4) Keep each field concise and specific.",
        "5) fullText must be a concise stitched summary for narration, not raw judgment text.",
      ].join(" "),
      user: `Summarize this legal judgment excerpt accurately:\n${analysisInput}`,
      responseFormat: "json",
      maxTokens: 900,
    });

    if (!content) return fallback;
    const parsed = JSON.parse(content);
    return sanitizeSummary(parsed, sourceText, fallback);
  } catch (_error) {
    return fallback;
  }
}

module.exports = { summarizeText };
