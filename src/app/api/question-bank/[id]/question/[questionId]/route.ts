export const dynamic = "force-dynamic";

import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { QuestionRow } from '@/types/database';
import { normalizeAnswer, normalizeBankQuestionNumbers, parseQuestionRow } from '@/lib/question-utils';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const { id, questionId } = await params;
    const row = db.prepare('SELECT * FROM question WHERE id = ? AND bank_id = ?').get(questionId, id) as QuestionRow | undefined;
    if (!row) return error('题目不存在', 404);
    return success(parseQuestionRow(row));
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const { id, questionId } = await params;
    const body = await request.json();
    const existing = db.prepare('SELECT * FROM question WHERE id = ? AND bank_id = ?').get(questionId, id) as QuestionRow | undefined;
    if (!existing) return error('题目不存在', 404);

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.stem !== undefined) { updates.push('stem = ?'); values.push(body.stem); }
    if (body.options !== undefined) { updates.push('options = ?'); values.push(JSON.stringify(body.options)); }
    if (body.answer !== undefined) { updates.push('answer = ?'); values.push(normalizeAnswer(body.answer)); }
    if (body.explanation !== undefined) { updates.push('explanation = ?'); values.push(body.explanation); }
    if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }
    if (body.number !== undefined) { updates.push('number = ?'); values.push(body.number); }
    if (body.ai_flags !== undefined) { updates.push('ai_flags = ?'); values.push(JSON.stringify(body.ai_flags)); }

    if (updates.length === 0) return error('没有需要更新的字段');

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(questionId);
    db.prepare(`UPDATE question SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    normalizeBankQuestionNumbers(Number(id));

    const row = db.prepare('SELECT * FROM question WHERE id = ?').get(questionId) as QuestionRow;
    return success(parseQuestionRow(row));
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const { id, questionId } = await params;
    const existing = db.prepare('SELECT * FROM question WHERE id = ? AND bank_id = ?').get(questionId, id);
    if (!existing) return error('题目不存在', 404);
    db.prepare('DELETE FROM question WHERE id = ?').run(questionId);
    normalizeBankQuestionNumbers(Number(id));
    return success({ deleted: true });
  } catch (e) {
    return error(String(e), 500);
  }
}
