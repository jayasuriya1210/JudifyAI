const db = require("../config/db");

const Summary = {
  save: (user_id, case_id, summary) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO summaries (
          user_id, case_id, background, legal_issues, arguments, court_reasoning, judgment_outcome, full_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          user_id,
          case_id,
          summary.background || "",
          summary.legalIssues || "",
          summary.arguments || "",
          summary.courtReasoning || "",
          summary.judgmentOutcome || "",
          summary.fullText || "",
        ],
        function (err) {
          err ? reject(err) : resolve(this.lastID);
        }
      );
    });
  },

  latestByCase: (user_id, case_id) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM summaries
         WHERE user_id = ? AND case_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [user_id, case_id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
  },

  findById: (user_id, summary_id) => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM summaries
         WHERE user_id = ? AND id = ?
         LIMIT 1`,
        [user_id, summary_id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
  },
};

module.exports = Summary;
