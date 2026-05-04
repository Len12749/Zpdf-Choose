'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { QuestionBankRow } from '@/types/database';

interface BankFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editBank?: QuestionBankRow | null;
}

export function BankForm({ open, onClose, onSuccess, editBank }: BankFormProps) {
  const [name, setName] = useState(editBank?.name || '');
  const [description, setDescription] = useState(editBank?.description || '');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const resetAndClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('题库名称不能为空', 'error');
      return;
    }
    setLoading(true);
    try {
      const url = editBank ? `/api/question-bank/${editBank.id}` : '/api/question-bank';
      const method = editBank ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast(editBank ? '题库已更新' : '题库已创建', 'success');
        onSuccess();
        resetAndClose();
      } else {
        toast(data.error || '操作失败', 'error');
      }
    } catch {
      toast('网络错误', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title={editBank ? '编辑题库' : '新建题库'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="题库名称"
          placeholder="输入题库名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Textarea
          label="备注（可选）"
          placeholder="输入题库描述或备注"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={resetAndClose}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {editBank ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
