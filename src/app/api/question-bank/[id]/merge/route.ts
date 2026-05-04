import { db } from '@/lib/db';
import { success, error } from '@/lib/api-response';
import { normalizeBankQuestionNumbers } from '@/lib/question-utils';
import { QuestionBankRow } from '@/types/database';

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { sourceBankIds, deleteSources = false, newName, newDescription } = body;

    if (!Array.isArray(sourceBankIds) || sourceBankIds.length === 0) {
      return error('请选择要合并的题库');
    }

    const targetBank = db.prepare('SELECT * FROM question_bank WHERE id = ?').get(id) as QuestionBankRow | undefined;
    if (!targetBank) return error('目标题库不存在', 404);

    const maxNumber = db.prepare('SELECT MAX(number) as max FROM question WHERE bank_id = ?').get(id) as { max: number | null };
    let nextNumber = (maxNumber.max || 0) + 1;

    const insertStmt = db.prepare(
      'INSERT INTO question (bank_id, number, stem, options, answer, explanation, type, is_ai_generated, ai_flags, source_page, answer_source_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const insertMany = db.transaction((sourceIds: number[]) => {
      for (const sourceId of sourceIds) {
        const questions = db.prepare('SELECT * FROM question WHERE bank_id = ? ORDER BY number').all(sourceId);
        for (const q of questions as { stem: string; options: string; answer: string; explanation: string; type: string; is_ai_generated: number; ai_flags?: string; source_page: number | null; answer_source_page?: number | null }[]) {
          insertStmt.run(id, nextNumber++, q.stem, q.options, q.answer, q.explanation, q.type, q.is_ai_generated, q.ai_flags || '[]', q.source_page, q.answer_source_page ?? null);
        }
      }
      const name = typeof newName === 'string' && newName.trim() ? newName.trim() : targetBank.name;
      const description = typeof newDescription === 'string' ? newDescription.trim() : targetBank.description;
      db.prepare("UPDATE question_bank SET name = ?, description = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(name, description, id);
    });

    insertMany(sourceBankIds.map(Number));
    normalizeBankQuestionNumbers(Number(id));

    if (deleteSources) {
      const placeholders = sourceBankIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM question_bank WHERE id IN (${placeholders})`).run(...sourceBankIds.map(Number));
    }

    const total = db.prepare('SELECT COUNT(*) as count FROM question WHERE bank_id = ?').get(id) as { count: number };
    return success({ totalQuestions: total.count });
  } catch (e) {
    return error(String(e), 500);
  }
}
