'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, ChevronLeft, ChevronRight, Edit3, Trash2, Star, AlertCircle, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Question, QuestionType } from '@/types/question';
import { QuestionBankRow } from '@/types/database';
import { hasAnswerAiFlags, hasExplanationAiFlags, hasOptionAiFlags, hasQuestionLevelAiFlags } from '@/lib/ai-flags';
import { cn } from '@/lib/utils';
import { fetchPageData } from '@/lib/page-api';

export default function BankDetailPage() {
  const params = useParams();
  const bankId = params.id as string;
  const { toast } = useToast();

  const [bank, setBank] = useState<(QuestionBankRow & { question_count: number }) | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<Question | null>(null);
  const [answerImportOpen, setAnswerImportOpen] = useState(false);
  const [answerImportText, setAnswerImportText] = useState('');
  const [importingAnswers, setImportingAnswers] = useState(false);
  const [editForm, setEditForm] = useState({
    stem: '',
    answer: '',
    explanation: '',
    type: 'single' as QuestionType,
    options: [
      { label: 'A', content: '' },
      { label: 'B', content: '' },
      { label: 'C', content: '' },
      { label: 'D', content: '' },
    ],
  });

  const toggleFavorite = async (questionId: number, bankIdValue: number) => {
    const res = await fetch('/api/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, bankId: bankIdValue }),
    });
    const data = await res.json();
    if (!data.success) {
      toast(data.error || '收藏操作失败', 'error');
      return;
    }

    const nextFavorited = data.data.favorited;
    setQuestions((prev) => prev.map((question) => (
      question.id === questionId ? { ...question, is_favorite: nextFavorited } : question
    )));
    toast(nextFavorited ? '已收藏' : '已取消收藏', 'success');
  };

  const fetchBank = useCallback(async () => {
    const data = await fetchPageData<QuestionBankRow & { question_count: number }>(`/api/question-bank/${bankId}`);
    setBank(data);
  }, [bankId]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) {
      if (/^\d+$/.test(search)) {
        params.set('number', search);
      } else {
        params.set('search', search);
      }
    }
    const data = await fetchPageData<{ questions: Question[]; total: number }>(`/api/question-bank/${bankId}/question?${params}`);
    setQuestions(data?.questions || []);
    setTotal(data?.total || 0);
    setLoading(false);
  }, [bankId, page, search]);

  useEffect(() => {
    const run = async () => {
      await fetchBank();
    };
    void run();
  }, [fetchBank]);

  useEffect(() => {
    const run = async () => {
      await fetchQuestions();
    };
    void run();
  }, [fetchQuestions]);

  const handleDeleteQuestion = async (questionId: number) => {
    if (!confirm('确定删除此题？')) return;
    const res = await fetch(`/api/question-bank/${bankId}/question/${questionId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast('题目已删除', 'success');
      fetchQuestions();
      fetchBank();
    }
  };

  const handleEditQuestion = (q: Question) => {
    setEditForm({
      stem: q.stem,
      answer: q.answer,
      explanation: q.explanation,
      type: q.type,
      options: q.options.length > 0
        ? q.options.map((opt) => ({ ...opt }))
        : [
            { label: 'A', content: '' },
            { label: 'B', content: '' },
            { label: 'C', content: '' },
            { label: 'D', content: '' },
          ],
    });
    setEditModal(q);
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    const res = await fetch(`/api/question-bank/${bankId}/question/${editModal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        options: editForm.options.filter((opt) => opt.content.trim()),
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast('题目已更新', 'success');
      setEditModal(null);
      fetchQuestions();
    } else {
      toast(data.error || '更新失败', 'error');
    }
  };

  const handleImportAnswers = async () => {
    setImportingAnswers(true);
    const normalizedLines = answerImportText
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim());

    const res = await fetch(`/api/question-bank/${bankId}/question`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: normalizedLines }),
    });
    const data = await res.json();
    setImportingAnswers(false);

    if (!data.success) {
      toast(data.error || '批量导入答案失败', 'error');
      return;
    }

    toast(`已导入 ${data.data.updatedCount} 道题的答案`, 'success');
    setAnswerImportOpen(false);
    setAnswerImportText('');
    fetchQuestions();
  };

  const totalPages = Math.ceil(total / 20);

  const typeLabel = (type: string) => {
    switch (type) {
      case 'single': return '单选';
      case 'multiple': return '多选';
      case 'indefinite': return '不定项';
      default: return type;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/question-bank" className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-accent mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" /> 返回题库列表
      </Link>

      {bank && (
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-content-primary">{bank.name}</h1>
              {bank.description && <p className="text-content-secondary mt-1">{bank.description}</p>}
              <p className="text-sm text-content-secondary mt-2">共 {bank.question_count} 道题</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="ghost"
                icon={<ListPlus className="w-4 h-4" />}
                onClick={() => setAnswerImportOpen(true)}
              >
                批量导入答案
              </Button>
              <Link href={`/question-bank/${bankId}/create`}>
                <Button icon={<Plus className="w-4 h-4" />}>添加题目</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Input
          placeholder="搜索题目内容或输入题号..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          icon={<Search className="w-4 h-4" />}
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-surface-secondary rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-content-secondary mb-4">{search ? '未找到匹配的题目' : '暂无题目'}</p>
          {!search && (
            <Link href={`/question-bank/${bankId}/create`}>
              <Button icon={<Plus className="w-4 h-4" />}>添加题目</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="bg-surface-secondary border border-border rounded-2xl p-5 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge>{typeLabel(q.type)}</Badge>
                      {hasQuestionLevelAiFlags(q.ai_flags) && <Badge variant="warning">AI补全</Badge>}
                      {hasAnswerAiFlags(q.ai_flags) && <Badge variant="warning">答案含AI补全</Badge>}
                      {hasOptionAiFlags(q.ai_flags) && <Badge variant="warning">选项含AI补全</Badge>}
                      {hasExplanationAiFlags(q.ai_flags) && <Badge variant="warning">解析含AI补全</Badge>}
                      {Boolean(q.wrong_count && q.wrong_count > 0) && (
                        <span className="flex items-center gap-1 text-xs text-error">
                          <AlertCircle className="w-3 h-3" /> 错{q.wrong_count}次
                        </span>
                      )}
                    </div>
                    <p className="text-content-primary leading-relaxed whitespace-pre-wrap">{q.stem}</p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt) => (
                        <div
                          key={opt.label}
                          className={`text-sm px-3 py-2 rounded-lg ${
                            q.answer.includes(opt.label)
                              ? 'bg-success/10 text-success border border-success/20'
                              : 'bg-surface-tertiary text-content-secondary'
                          }`}
                        >
                          <span className="font-medium">{opt.label}.</span> {opt.content}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-content-secondary">
                      <span className="font-medium text-accent">答案：</span>
                      <span>{q.answer || '未识别'}</span>
                    </div>
                    {q.explanation && (
                      <p className="mt-3 text-sm text-content-secondary bg-surface-tertiary rounded-lg p-3">
                        <span className="font-medium text-accent">解析：</span>{q.explanation}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => void toggleFavorite(q.id, q.bank_id)}
                      className="p-2 rounded-lg text-content-secondary hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                      title={q.is_favorite ? '取消收藏' : '收藏'}
                    >
                      <Star className={cn('w-4 h-4', q.is_favorite ? 'text-warning fill-warning' : '')} />
                    </button>
                    <button
                      onClick={() => handleEditQuestion(q)}
                      className="p-2 rounded-lg text-content-secondary hover:text-accent hover:bg-surface-tertiary transition-colors cursor-pointer"
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-2 rounded-lg text-content-secondary hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                上一页
              </Button>
              <span className="text-sm text-content-secondary">{page} / {totalPages}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页 <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="编辑题目">
        {editModal && (
          <div className="space-y-4">
            <Textarea
              label="题干"
              value={editForm.stem}
              onChange={(e) => setEditForm((f) => ({ ...f, stem: e.target.value }))}
              rows={4}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {editForm.options.map((opt, index) => (
                <Input
                  key={opt.label}
                  label={`选项 ${opt.label}`}
                  value={opt.content}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditForm((form) => ({
                      ...form,
                      options: form.options.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, content: value } : item
                      ),
                    }));
                  }}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-content-secondary">题型</label>
              <div className="flex gap-3">
                {(['single', 'multiple', 'indefinite'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value={t}
                      checked={editForm.type === t}
                      onChange={() => setEditForm((f) => ({ ...f, type: t }))}
                      className="accent-accent"
                    />
                    <span className="text-sm text-content-primary">{typeLabel(t)}</span>
                  </label>
                ))}
              </div>
            </div>
            <Input
              label="答案"
              placeholder="如 A 或 AC"
              value={editForm.answer}
              onChange={(e) => setEditForm((f) => ({ ...f, answer: e.target.value }))}
            />
            <Textarea
              label="解析"
              value={editForm.explanation}
              onChange={(e) => setEditForm((f) => ({ ...f, explanation: e.target.value }))}
              rows={3}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setEditModal(null)}>取消</Button>
              <Button onClick={handleSaveEdit}>保存</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={answerImportOpen} onClose={() => setAnswerImportOpen(false)} title="批量导入答案">
        <div className="space-y-4">
          <p className="text-sm text-content-secondary leading-6">
            按题目顺序每行输入一个答案，例如 <span className="text-content-primary font-medium">A</span>、<span className="text-content-primary font-medium">BC</span>。
            某一题暂时没有答案时，该行留空即可。
          </p>
          <Textarea
            label="答案列表"
            placeholder={`A\n\nBC\nD`}
            value={answerImportText}
            onChange={(e) => setAnswerImportText(e.target.value)}
            rows={12}
          />
          <div className="rounded-xl bg-surface-tertiary border border-border px-4 py-3 text-sm text-content-secondary">
            当前将按题号顺序覆盖答案。空行会跳过，不会清空已有答案。
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setAnswerImportOpen(false)}>取消</Button>
            <Button onClick={() => void handleImportAnswers()} disabled={importingAnswers}>
              {importingAnswers ? '导入中...' : '开始导入'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
