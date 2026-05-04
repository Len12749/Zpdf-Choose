'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { QuestionBankRow } from '@/types/database';

interface BankMergeDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetBank: QuestionBankRow | null;
}

export function BankMergeDialog({ open, onClose, onSuccess, targetBank }: BankMergeDialogProps) {
  const [banks, setBanks] = useState<(QuestionBankRow & { question_count: number })[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [deleteSources, setDeleteSources] = useState(false);
  const [newName, setNewName] = useState(targetBank?.name || '');
  const [newDescription, setNewDescription] = useState(targetBank?.description || '');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetch('/api/question-bank')
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setBanks(data.data.filter((b: QuestionBankRow) => b.id !== targetBank?.id));
          }
        });
    }
  }, [open, targetBank]);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      toast('请选择要合并的题库', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/question-bank/${targetBank?.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceBankIds: selected, deleteSources, newName, newDescription }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`合并成功，共 ${data.data.totalQuestions} 道题`, 'success');
        onSuccess();
        onClose();
      } else {
        toast(data.error || '合并失败', 'error');
      }
    } catch {
      toast('网络错误', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="合并题库">
      <div className="space-y-4">
        <Input
          label="合并后题库名称"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="输入合并后的题库名称"
        />
        <Textarea
          label="合并后备注"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="输入合并后的备注"
          rows={3}
        />
        <p className="text-sm text-content-secondary">
          选择要合并到 <span className="text-accent font-medium">{targetBank?.name}</span> 的题库：
        </p>
        <div className="max-h-60 overflow-y-auto space-y-2">
          {banks.map((bank) => (
            <label
              key={bank.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selected.includes(bank.id)
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/30'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(bank.id)}
                onChange={() => toggle(bank.id)}
                className="w-4 h-4 accent-accent"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-content-primary truncate">{bank.name}</p>
                <p className="text-xs text-content-secondary">{bank.question_count} 道题</p>
              </div>
            </label>
          ))}
          {banks.length === 0 && (
            <p className="text-center text-content-secondary py-4">没有其他可合并的题库</p>
          )}
        </div>
        {selected.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={deleteSources}
              onChange={(e) => setDeleteSources(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            合并后删除源题库
          </label>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} loading={loading} disabled={selected.length === 0}>
            合并 ({selected.length})
          </Button>
        </div>
      </div>
    </Modal>
  );
}
