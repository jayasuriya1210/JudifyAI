const db = require("../config/db");

const User = {
  create: async (name, email, password) => {
    const result = await db.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id",
      [name, email, password]
    );
    return result.rows[0].id;
  },

  findById: async (id) => {
    const result = await db.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [id]
    );
    return result.rows[0];
  },

  findByEmail: async (email) => {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0];
  },
};

module.exports = User;
