'use client';

import Link from 'next/link';
import { Trash2, Edit3, GitMerge, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { QuestionBankRow } from '@/types/database';

interface BankCardProps {
  bank: QuestionBankRow & { question_count: number };
  onEdit: (bank: QuestionBankRow) => void;
  onDelete: (id: number) => void;
  onMerge: (bank: QuestionBankRow) => void;
}

export function BankCard({ bank, onEdit, onDelete, onMerge }: BankCardProps) {
  return (
    <Card hover className="group">
      <div className="flex items-start justify-between gap-4">
        <Link href={`/question-bank/${bank.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-content-primary truncate">{bank.name}</h3>
              <p className="text-xs text-content-secondary">
                {bank.question_count} 道题 · 更新于 {bank.updated_at?.split(' ')[0] || '未知'}
              </p>
            </div>
          </div>
          {bank.description && (
            <p className="text-sm text-content-secondary line-clamp-2 ml-[52px]">{bank.description}</p>
          )}
        </Link>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(bank); }}
            className="p-2 rounded-lg text-content-secondary hover:text-accent hover:bg-surface-tertiary transition-colors cursor-pointer"
            title="编辑"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMerge(bank); }}
            className="p-2 rounded-lg text-content-secondary hover:text-accent hover:bg-surface-tertiary transition-colors cursor-pointer"
            title="合并"
          >
            <GitMerge className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(bank.id); }}
            className="p-2 rounded-lg text-content-secondary hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
