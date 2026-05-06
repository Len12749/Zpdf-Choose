'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { fetchPageData } from '@/lib/page-api';
import { Question } from '@/types/question';
import { cn } from '@/lib/utils';
import { hasAnswerAiFlags, hasExplanationAiFlags, hasOptionAiFlags, hasQuestionLevelAiFlags } from '@/lib/ai-flags';

export default function FavoritesPage() {
  const { toast } = useToast();
  const [favorites, setFavorites] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchFavorites = useCallback(async () => {
    const data = await fetchPageData<Question[]>('/api/favorite');
    setFavorites(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const run = async () => {
      await fetchFavorites();
    };
    void run();
  }, [fetchFavorites]);

  const handleRemove = async (questionId: number, bankId: number) => {
    const res = await fetch('/api/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, bankId }),
    });
    const data = await res.json();
    if (data.success && !data.data.favorited) {
      setFavorites((prev) => prev.filter((q) => q.id !== questionId));
      toast('已取消收藏', 'success');
    }
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-content-primary">我的收藏</h1>
        <p className="text-sm text-content-secondary mt-1">共 {favorites.length} 道收藏题目</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-surface-secondary rounded-2xl animate-pulse" />)}
        </div>
      ) : favorites.length === 0 ? (
        <div className="text-center py-20">
          <Star className="w-16 h-16 text-content-secondary/30 mx-auto mb-4" />
          <p className="text-content-secondary">暂无收藏题目</p>
          <p className="text-sm text-content-secondary/70 mt-1">在刷题或背题时点击星标收藏</p>
        </div>
      ) : (
        <div className="space-y-3">
          {favorites.map((q) => {
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
                      {hasQuestionLevelAiFlags(q.ai_flags) && <Badge variant="warning">AI补全</Badge>}
                      {hasAnswerAiFlags(q.ai_flags) && <Badge variant="warning">答案含AI补全</Badge>}
                      {hasOptionAiFlags(q.ai_flags) && <Badge variant="warning">选项含AI补全</Badge>}
                      {hasExplanationAiFlags(q.ai_flags) && <Badge variant="warning">解析含AI补全</Badge>}
                    </div>
                    <p className="text-content-primary line-clamp-2">{q.stem}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(q.id, q.bank_id); }}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                      title="取消收藏"
                    >
                      <Trash2 className="w-4 h-4" />
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
