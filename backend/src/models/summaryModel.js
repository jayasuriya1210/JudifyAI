const db = require("../config/db");

const Summary = {
  save: async (user_id, case_id, summary) => {
    const result = await db.query(
      `INSERT INTO summaries (
        user_id, case_id, background, legal_issues, arguments, court_reasoning, judgment_outcome, full_summary, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id`,
      [
        user_id,
        case_id,
        summary.background || "",
        summary.legalIssues || "",
        summary.arguments || "",
        summary.courtReasoning || "",
        summary.judgmentOutcome || "",
        summary.fullText || "",
      ]
    );

    return result.rows[0].id;
  },

  latestByCase: async (user_id, case_id) => {
    const result = await db.query(
      `SELECT * FROM summaries
       WHERE user_id = $1 AND case_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [user_id, case_id]
    );
    return result.rows[0];
  },
};

module.exports = Summary;
