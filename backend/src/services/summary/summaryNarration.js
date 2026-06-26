function normalizeSummaryText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const SUMMARY_SECTION_DEFS = [
  { key: "background", dbKey: "background", label: "Background" },
  { key: "legalIssues", dbKey: "legal_issues", label: "Legal Issues" },
  { key: "arguments", dbKey: "arguments", label: "Arguments" },
  { key: "courtReasoning", dbKey: "court_reasoning", label: "Court Reasoning" },
  { key: "judgmentOutcome", dbKey: "judgment_outcome", label: "Judgment Outcome" },
];

function getSummaryField(summary, key, dbKey) {
  return normalizeSummaryText(summary?.[key] || summary?.[dbKey] || "");
}

function buildSummaryNarration(summary = {}) {
  const providedAudioText = normalizeSummaryText(summary.audioText);
  if (providedAudioText) return providedAudioText;

  const lines = SUMMARY_SECTION_DEFS.map(({ key, dbKey, label }) => {
    const content = getSummaryField(summary, key, dbKey);
    return content ? `${label}: ${content}` : "";
  }).filter(Boolean);

  if (lines.length) return lines.join("\n\n");

  return normalizeSummaryText(summary.fullText || summary.full_summary || "");
}

function splitNarrationChunks(text, maxChars = 1100) {
  const clean = normalizeSummaryText(text);
  if (!clean) return [];

  const safeMaxChars = Math.max(200, Number(maxChars) || 1100);
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!sentences.length) return [clean.slice(0, safeMaxChars)];

  const chunks = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (sentence.length > safeMaxChars) {
      const words = sentence.split(/\s+/).filter(Boolean);
      let wordBuffer = "";
      for (const word of words) {
        if (!wordBuffer) {
          wordBuffer = word;
          continue;
        }

        if ((wordBuffer.length + word.length + 1) <= safeMaxChars) {
          wordBuffer += ` ${word}`;
        } else {
          chunks.push(wordBuffer);
          wordBuffer = word;
        }
      }
      if (wordBuffer) chunks.push(wordBuffer);
      continue;
    }

    if (!buffer) {
      buffer = sentence;
      continue;
    }

    if ((buffer.length + sentence.length + 1) <= safeMaxChars) {
      buffer += ` ${sentence}`;
    } else {
      chunks.push(buffer);
      buffer = sentence;
    }
  }

  if (buffer) chunks.push(buffer);
  return chunks;
}

module.exports = {
  normalizeSummaryText,
  buildSummaryNarration,
  splitNarrationChunks,
};
