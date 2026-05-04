import Database from 'better-sqlite3';

export function initializeDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS question (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL,
      number INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT DEFAULT '',
      is_ai_generated INTEGER DEFAULT 0,
      ai_flags TEXT DEFAULT '[]',
      type TEXT DEFAULT 'single',
      source_page INTEGER,
      answer_source_page INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (bank_id) REFERENCES question_bank(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wrong_answer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL UNIQUE,
      bank_id INTEGER NOT NULL,
      wrong_count INTEGER DEFAULT 1,
      last_wrong_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_id) REFERENCES question_bank(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorite (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL UNIQUE,
      bank_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_id) REFERENCES question_bank(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_question_bank_id ON question(bank_id);
    CREATE INDEX IF NOT EXISTS idx_question_number ON question(bank_id, number);
    CREATE INDEX IF NOT EXISTS idx_wrong_answer_bank ON wrong_answer(bank_id);
    CREATE INDEX IF NOT EXISTS idx_favorite_bank ON favorite(bank_id);
  `);

  ensureQuestionColumn(db, 'ai_flags', "TEXT DEFAULT '[]'");
  ensureQuestionColumn(db, 'answer_source_page', 'INTEGER');
}

function ensureQuestionColumn(db: Database.Database, columnName: string, definition: string): void {
  const columns = db.prepare("PRAGMA table_info('question')").all() as { name: string }[];
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE question ADD COLUMN ${columnName} ${definition}`);
  }
}
