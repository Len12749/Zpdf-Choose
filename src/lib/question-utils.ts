import { db } from '@/lib/db';
import { QuestionRow } from '@/types/database';
import { Option, Question } from '@/types/question';

export function parseAiFlags(aiFlags: string | null | undefined): string[] {
  if (!aiFlags) return [];
  try {
    const parsed = JSON.parse(aiFlags);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function parseQuestionRow(
  row: QuestionRow & { wrong_count?: number; is_favorite?: number }
): Question {
  return {
    ...row,
    options: JSON.parse(row.options) as Option[],
    is_ai_generated: row.is_ai_generated === 1,
    ai_flags: parseAiFlags(row.ai_flags),
    is_favorite: row.is_favorite === 1,
    wrong_count: row.wrong_count || 0,
  };
}

export function normalizeAnswer(answer: string): string {
  return answer.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
}

export function normalizeBankQuestionNumbers(bankId: number): void {
  const rows = db.prepare(
    'SELECT id FROM question WHERE bank_id = ? ORDER BY number ASC, id ASC'
  ).all(bankId) as { id: number }[];

  const updateStmt = db.prepare('UPDATE question SET number = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?');
  const transaction = db.transaction((items: { id: number }[]) => {
    items.forEach((item, index) => {
      updateStmt.run(index + 1, item.id);
    });
    db.prepare("UPDATE question_bank SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(bankId);
  });

  transaction(rows);
}
