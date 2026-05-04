'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BankCard } from '@/components/bank/BankCard';
import { BankForm } from '@/components/bank/BankForm';
import { BankMergeDialog } from '@/components/bank/BankMergeDialog';
import { useToast } from '@/components/ui/Toast';
import { QuestionBankRow } from '@/types/database';

export default function QuestionBankPage() {
  const [banks, setBanks] = useState<(QuestionBankRow & { question_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editBank, setEditBank] = useState<QuestionBankRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<QuestionBankRow | null>(null);
  const { toast } = useToast();

  const fetchBanks = useCallback(async () => {
    try {
      const res = await fetch('/api/question-bank');
      const data = await res.json();
      if (data.success) setBanks(data.data);
    } catch {
      toast('加载题库失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const run = async () => {
      await fetchBanks();
    };
    void run();
  }, [fetchBanks]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个题库吗？所有题目将被永久删除。')) return;
    try {
      const res = await fetch(`/api/question-bank/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast('题库已删除', 'success');
        fetchBanks();
      } else {
        toast(data.error || '删除失败', 'error');
      }
    } catch {
      toast('网络错误', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">题库管理</h1>
          <p className="text-sm text-content-secondary mt-1">创建和管理你的题库</p>
        </div>
        <Button onClick={() => { setEditBank(null); setFormOpen(true); }} icon={<Plus className="w-4 h-4" />}>
          新建题库
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-surface-secondary rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : banks.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-content-secondary mb-4">还没有题库</p>
          <Button onClick={() => { setEditBank(null); setFormOpen(true); }} icon={<Plus className="w-4 h-4" />}>
            创建第一个题库
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banks.map((bank) => (
            <BankCard
              key={bank.id}
              bank={bank}
              onEdit={(b) => { setEditBank(b); setFormOpen(true); }}
              onDelete={handleDelete}
              onMerge={(b) => { setMergeTarget(b); setMergeOpen(true); }}
            />
          ))}
        </div>
      )}

      <BankForm
        key={`${editBank?.id ?? 'new'}-${formOpen ? 'open' : 'closed'}`}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditBank(null); }}
        onSuccess={fetchBanks}
        editBank={editBank}
      />

      <BankMergeDialog
        key={`${mergeTarget?.id ?? 'none'}-${mergeOpen ? 'open' : 'closed'}`}
        open={mergeOpen}
        onClose={() => { setMergeOpen(false); setMergeTarget(null); }}
        onSuccess={fetchBanks}
        targetBank={mergeTarget}
      />
    </div>
  );
}
