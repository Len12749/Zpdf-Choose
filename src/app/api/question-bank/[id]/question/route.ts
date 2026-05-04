import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { QuestionRow } from '@/types/database';
import { normalizeAnswer, parseAiFlags, parseQuestionRow } from '@/lib/question-utils';

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const number = url.searchParams.get('number');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;

    let sql = `
      SELECT q.*, COALESCE(w.wrong_count, 0) as wrong_count, CASE WHEN f.id IS NULL THEN 0 ELSE 1 END as is_favorite
      FROM question q
      LEFT JOIN wrong_answer w ON w.question_id = q.id
      LEFT JOIN favorite f ON f.question_id = q.id
      WHERE q.bank_id = ?
    `;
    const conditions: string[] = [];
    const values: (string | number)[] = [id];

    if (search) {
      conditions.push('stem LIKE ?');
      values.push(`%${search}%`);
    }
    if (number) {
      conditions.push('number = ?');
      values.push(parseInt(number));
    }

    if (conditions.length > 0) {
      sql += ' AND ' + conditions.join(' AND ');
    }

    const countSql = `
      SELECT COUNT(*) as total
      FROM question q
      WHERE q.bank_id = ?
      ${conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''}
    `;
    const total = (db.prepare(countSql).get(...values) as { total: number }).total;

    sql += ' ORDER BY number ASC LIMIT ? OFFSET ?';
    values.push(limit, offset);
    const rows = db.prepare(sql).all(...values) as (QuestionRow & { wrong_count: number; is_favorite: number })[];

    return success({
      questions: rows.map(parseQuestionRow),
      total,
      page,
      limit,
    });
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { stem, options, answer, explanation = '', type = 'single', is_ai_generated = false, ai_flags = [] } = body;

    if (!stem || !Array.isArray(options) || options.length === 0 || !answer) {
      return error('题干、选项和答案不能为空');
    }

    const bankExists = db.prepare('SELECT id FROM question_bank WHERE id = ?').get(id);
    if (!bankExists) return error('题库不存在', 404);

    const maxNumber = db.prepare('SELECT MAX(number) as max FROM question WHERE bank_id = ?').get(id) as { max: number | null };
    const nextNumber = (maxNumber.max || 0) + 1;

    const result = db.prepare(
      'INSERT INTO question (bank_id, number, stem, options, answer, explanation, type, is_ai_generated, ai_flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, nextNumber, stem.trim(), JSON.stringify(options), normalizeAnswer(answer), explanation.trim(), type, is_ai_generated ? 1 : 0, JSON.stringify(ai_flags));

    db.prepare("UPDATE question_bank SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);

    const row = db.prepare('SELECT * FROM question WHERE id = ?').get(result.lastInsertRowid) as QuestionRow;
    return success(parseQuestionRow(row), 201);
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const answers = Array.isArray(body.answers) ? body.answers : null;

    if (!answers) {
      return error('缺少答案列表');
    }

    const bankExists = db.prepare('SELECT id FROM question_bank WHERE id = ?').get(id);
    if (!bankExists) return error('题库不存在', 404);

    const rows = db.prepare('SELECT id, ai_flags FROM question WHERE bank_id = ? ORDER BY number ASC, id ASC').all(id) as Array<{ id: number; ai_flags: string | null }>;
    if (rows.length === 0) {
      return error('题库中暂无题目');
    }

    const updateStmt = db.prepare(
      "UPDATE question SET answer = ?, ai_flags = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
    );

    let updatedCount = 0;
    const transaction = db.transaction(() => {
      rows.forEach((row, index) => {
        const rawAnswer = typeof answers[index] === 'string' ? answers[index] : '';
        const normalized = normalizeAnswer(rawAnswer);
        if (!normalized) {
          return;
        }

        const nextFlags = parseAiFlags(row.ai_flags).filter((flag) => (
          flag !== 'missing_answer_inferred' && flag !== 'missing_answer_unresolved'
        ));

        updateStmt.run(normalized, JSON.stringify(nextFlags), row.id);
        updatedCount += 1;
      });

      db.prepare("UPDATE question_bank SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    });

    transaction();
    return success({ updatedCount, totalQuestions: rows.length });
  } catch (e) {
    return error(String(e), 500);
  }
}
