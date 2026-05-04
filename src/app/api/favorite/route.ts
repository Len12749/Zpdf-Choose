import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { QuestionRow } from '@/types/database';
import { parseQuestionRow } from '@/lib/question-utils';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bankId = url.searchParams.get('bankId');

    let sql = `
      SELECT q.*, 1 as is_favorite, COALESCE(w.wrong_count, 0) as wrong_count
      FROM favorite f
      JOIN question q ON q.id = f.question_id
      LEFT JOIN wrong_answer w ON w.question_id = q.id
    `;
    const values: (string | number)[] = [];

    if (bankId) {
      sql += ' WHERE f.bank_id = ?';
      values.push(bankId);
    }
    sql += ' ORDER BY f.created_at DESC';

    const rows = db.prepare(sql).all(...values) as (QuestionRow & { wrong_count: number; is_favorite: number })[];
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

    const existing = db.prepare('SELECT * FROM favorite WHERE question_id = ? AND bank_id = ?').get(questionId, bankId);
    if (existing) {
      db.prepare('DELETE FROM favorite WHERE question_id = ? AND bank_id = ?').run(questionId, bankId);
      return success({ favorited: false });
    } else {
      db.prepare('INSERT INTO favorite (question_id, bank_id) VALUES (?, ?)').run(questionId, bankId);
      return success({ favorited: true });
    }
  } catch (e) {
    return error(String(e), 500);
  }
}
