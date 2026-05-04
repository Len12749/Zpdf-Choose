import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = db.prepare(`
      SELECT qb.*, COUNT(q.id) as question_count
      FROM question_bank qb
      LEFT JOIN question q ON q.bank_id = qb.id
      GROUP BY qb.id
      ORDER BY qb.updated_at DESC
    `).all();
    return success(rows);
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description = '' } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return error('题库名称不能为空');
    }
    const result = db.prepare(
      'INSERT INTO question_bank (name, description) VALUES (?, ?)'
    ).run(name.trim(), description.trim());
    const bank = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(result.lastInsertRowid);
    return success(bank, 201);
  } catch (e) {
    return error(String(e), 500);
  }
}
