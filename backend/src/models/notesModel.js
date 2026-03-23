const db = require("../config/db");

const Notes = {
  save: async (user_id, case_id, note_text, pdf_path) => {
    const result = await db.query(
      `INSERT INTO notes (user_id, case_id, note_text, notes_path, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [user_id, case_id || null, note_text, pdf_path]
    );
    return result.rows[0].id;
  },

  listByUser: async (user_id) => {
    const result = await db.query(
      "SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC",
      [user_id]
    );
    return result.rows;
  },
};

module.exports = Notes;
