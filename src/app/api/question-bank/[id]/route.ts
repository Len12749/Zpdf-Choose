export const dynamic = "force-dynamic";

import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bank = db.prepare(`
      SELECT qb.*, COUNT(q.id) as question_count
      FROM question_bank qb
      LEFT JOIN question q ON q.bank_id = qb.id
      WHERE qb.id = ?
      GROUP BY qb.id
    `).get(id);
    if (!bank) return error('题库不存在', 404);
    return success(bank);
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
    const { name, description } = body;
    const existing = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id);
    if (!existing) return error('题库不存在', 404);

    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (name !== undefined) {
      if (!name.trim()) return error('题库名称不能为空');
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description.trim());
    }
    if (updates.length === 0) return error('没有需要更新的字段');

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);
    db.prepare(`UPDATE question_bank SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const bank = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id);
    return success(bank);
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id);
    if (!existing) return error('题库不存在', 404);
    db.prepare('DELETE FROM question_bank WHERE id = ?').run(id);
    return success({ deleted: true });
  } catch (e) {
    return error(String(e), 500);
  }
}
