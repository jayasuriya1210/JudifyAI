const db = require("../config/db");

const Audio = {
  save: async ({ user_id, case_id, summary_id, language, audio_url, audio_urls }) => {
    const result = await db.query(
      `INSERT INTO audio_records (user_id, case_id, summary_id, language, audio_url, audio_urls_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [
        user_id,
        case_id,
        summary_id || null,
        language || "en",
        audio_url,
        JSON.stringify(Array.isArray(audio_urls) ? audio_urls : []),
      ]
    );
    return result.rows[0].id;
  },

  latestByCase: async (user_id, case_id) => {
    const result = await db.query(
      `SELECT * FROM audio_records
       WHERE user_id = $1 AND case_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [user_id, case_id]
    );
    return result.rows[0];
  },
};

module.exports = Audio;
