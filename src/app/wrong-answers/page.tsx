'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { Question } from '@/types/question';
import { cn } from '@/lib/utils';
import { hasAnswerAiFlags, hasExplanationAiFlags, hasOptionAiFlags, hasQuestionLevelAiFlags } from '@/lib/ai-flags';

interface WrongQuestion extends Question {
  wrong_count: number;
  last_wrong_at: string;
}

export default function WrongAnswersPage() {
  const { toast } = useToast();
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/wrong-answer');
        const data = await res.json();
        if (data.success) setWrongQuestions(data.data);
      } catch {
        toast('加载错题失败', 'error');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [toast]);

  const toggleFavorite = async (questionId: number, bankId: number) => {
    const res = await fetch('/api/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, bankId }),
    });
    const data = await res.json();
    if (!data.success) {
      toast(data.error || '收藏操作失败', 'error');
      return;
    }

    setWrongQuestions((prev) => prev.map((question) => (
      question.id === questionId ? { ...question, is_favorite: data.data.favorited } : question
    )));
    toast(data.data.favorited ? '已收藏' : '已取消收藏', 'success');
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'single': return '单选';
      case 'multiple': return '多选';
      case 'indefinite': return '不定项';
      default: return type;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">错题本</h1>
          <p className="text-sm text-content-secondary mt-1">共 {wrongQuestions.length} 道错题</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-surface-secondary rounded-2xl animate-pulse" />)}
        </div>
      ) : wrongQuestions.length === 0 ? (
        <div className="text-center py-20">
          <AlertCircle className="w-16 h-16 text-content-secondary/30 mx-auto mb-4" />
          <p className="text-content-secondary">暂无错题</p>
          <p className="text-sm text-content-secondary/70 mt-1">刷题时答错的题目会自动记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {wrongQuestions.map((q) => {
            const isExpanded = expandedId === q.id;
            return (
              <div key={q.id} className="bg-surface-secondary border border-border rounded-2xl overflow-hidden">
                <div
                  className="p-4 cursor-pointer flex items-start gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge>{typeLabel(q.type)}</Badge>
                      <Badge variant="error">错 {q.wrong_count} 次</Badge>
                      {hasQuestionLevelAiFlags(q.ai_flags) && <Badge variant="warning">AI补全</Badge>}
                      {hasAnswerAiFlags(q.ai_flags) && <Badge variant="warning">答案含AI补全</Badge>}
                      {hasOptionAiFlags(q.ai_flags) && <Badge variant="warning">选项含AI补全</Badge>}
                      {hasExplanationAiFlags(q.ai_flags) && <Badge variant="warning">解析含AI补全</Badge>}
                    </div>
                    <p className="text-content-primary line-clamp-2">{q.stem}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorite(q.id, q.bank_id);
                      }}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                      title={q.is_favorite ? '取消收藏' : '收藏'}
                    >
                      <Star className={cn('w-4 h-4', q.is_favorite ? 'text-warning fill-warning' : '')} />
                    </button>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-content-secondary" /> : <ChevronDown className="w-5 h-5 text-content-secondary" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    <div className="space-y-2 mb-3">
                      {q.options.map((opt) => (
                        <div
                          key={opt.label}
                          className={cn(
                            'text-sm px-3 py-2 rounded-lg',
                            q.answer.includes(opt.label)
                              ? 'bg-success/10 text-success border border-success/20'
                              : 'bg-surface-tertiary text-content-secondary'
                          )}
                        >
                          <span className="font-medium">{opt.label}.</span> {opt.content}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-content-secondary mb-3">
                      <span className="font-medium text-accent">答案：</span>
                      <span>{q.answer || '未识别'}</span>
                    </div>
                    {q.explanation && (
                      <p className="text-sm text-content-secondary bg-surface-tertiary rounded-lg p-3">
                        <span className="font-medium text-accent">解析：</span>{q.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
