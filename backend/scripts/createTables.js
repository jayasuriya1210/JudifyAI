const pool = require("../src/config/db");

async function createTables() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        source_url TEXT,
        pdf_object_key TEXT,
        pdf_bucket TEXT,
        extracted_text TEXT,
        uploaded_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS summaries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        background TEXT,
        legal_issues TEXT,
        arguments TEXT,
        court_reasoning TEXT,
        judgment_outcome TEXT,
        full_summary TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audio_records (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        summary_id UUID REFERENCES summaries(id) ON DELETE SET NULL,
        language TEXT DEFAULT 'en',
        object_key TEXT NOT NULL,
        bucket TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
        language TEXT DEFAULT 'en',
        listened_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
        note_text TEXT,
        object_key TEXT,
        bucket TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ PostgreSQL Tables Created Successfully");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

createTables();