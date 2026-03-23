const db = require("../config/db");

const Case = {
  createFromSearch: async ({ user_id, title, source_url, pdf_url }) => {
    const result = await db.query(
      `INSERT INTO cases (user_id, title, source_url, pdf_url, uploaded_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [user_id, title || null, source_url || null, pdf_url || null]
    );
    return result.rows[0].id;
  },

  saveUpload: async ({ case_id, user_id, file_path, extracted_text, pdf_blob, pdf_mime, pdf_name }) => {
    if (case_id) {
      const result = await db.query(
        `UPDATE cases
         SET file_path = $1,
             pdf_blob = $2,
             pdf_mime = $3,
             pdf_name = $4,
             extracted_text = $5,
             uploaded_at = NOW()
         WHERE id = $6 AND user_id = $7
         RETURNING id`,
        [
          file_path,
          pdf_blob || null,
          pdf_mime || "application/pdf",
          pdf_name || null,
          extracted_text,
          case_id,
          user_id,
        ]
      );
      return result.rows[0]?.id || case_id;
    }

    const result = await db.query(
      `INSERT INTO cases (user_id, file_path, pdf_blob, pdf_mime, pdf_name, extracted_text, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [
        user_id,
        file_path,
        pdf_blob || null,
        pdf_mime || "application/pdf",
        pdf_name || null,
        extracted_text,
      ]
    );
    return result.rows[0].id;
  },

  findById: async (id, user_id) => {
    const result = await db.query(
      `SELECT id, user_id, title, source_url, pdf_url, file_path, extracted_text, uploaded_at
       FROM cases WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    return result.rows[0];
  },

  getPdfByCaseId: async (id, user_id) => {
    const result = await db.query(
      `SELECT id, title, file_path, pdf_blob, pdf_mime, pdf_name
       FROM cases WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    return result.rows[0];
  },

  listByUser: async (user_id) => {
    const result = await db.query(
      "SELECT * FROM cases WHERE user_id = $1 ORDER BY uploaded_at DESC",
      [user_id]
    );
    return result.rows;
  },

  getDashboardData: async (user_id) => {
    const result = await db.query(
      `SELECT
        c.id,
        c.title,
        c.source_url,
        c.pdf_url,
        c.file_path,
        c.uploaded_at,
        s.full_summary,
        a.audio_url,
        a.language,
        n.notes_path,
        h.listened_at
      FROM cases c
      LEFT JOIN summaries s ON s.case_id = c.id AND s.user_id = c.user_id
      LEFT JOIN audio_records a ON a.case_id = c.id AND a.user_id = c.user_id
      LEFT JOIN notes n ON n.case_id = c.id AND n.user_id = c.user_id
      LEFT JOIN history h ON h.case_id = c.id AND h.user_id = c.user_id
      WHERE c.user_id = $1
      ORDER BY c.uploaded_at DESC`,
      [user_id]
    );
    return result.rows;
  },
};

module.exports = Case;
