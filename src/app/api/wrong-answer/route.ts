export const dynamic = "force-dynamic";

import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { QuestionRow } from '@/types/database';
import { parseQuestionRow } from '@/lib/question-utils';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bankId = url.searchParams.get('bankId');

    let sql = `
      SELECT q.*, w.wrong_count, w.last_wrong_at
      FROM wrong_answer w
      JOIN question q ON q.id = w.question_id
    `;
    const values: (string | number)[] = [];

    if (bankId) {
      sql += ' WHERE w.bank_id = ?';
      values.push(bankId);
    }
    sql += ' ORDER BY w.wrong_count DESC, w.last_wrong_at DESC';

    const rows = db.prepare(sql).all(...values) as (QuestionRow & { wrong_count: number; last_wrong_at: string })[];
    return success(rows.map(parseQuestionRow));
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { questionId, bankId } = body;

    if (!questionId || !bankId) {
      return error('缺少题目ID或题库ID');
    }

    const existing = db.prepare('SELECT * FROM wrong_answer WHERE question_id = ? AND bank_id = ?').get(questionId, bankId);
    if (existing) {
      db.prepare(
        "UPDATE wrong_answer SET wrong_count = wrong_count + 1, last_wrong_at = datetime('now', 'localtime') WHERE question_id = ? AND bank_id = ?"
      ).run(questionId, bankId);
    } else {
      db.prepare('INSERT INTO wrong_answer (question_id, bank_id) VALUES (?, ?)').run(questionId, bankId);
    }

    const row = db.prepare('SELECT * FROM wrong_answer WHERE question_id = ? AND bank_id = ?').get(questionId, bankId);
    return success(row);
  } catch (e) {
    return error(String(e), 500);
  }
}
