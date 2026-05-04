'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, Star, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { Question } from '@/types/question';
import { cn } from '@/lib/utils';
import { hasAnswerAiFlags, hasExplanationAiFlags, hasOptionAiFlags, hasQuestionLevelAiFlags } from '@/lib/ai-flags';

export default function StudySessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const bankId = params.bankId as string;
  const order = searchParams.get('order') || 'asc';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bankName, setBankName] = useState('');
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const bankRes = await fetch(`/api/question-bank/${bankId}`);
        const bankData = await bankRes.json();
        if (bankData.success) setBankName(bankData.data.name);

        const qRes = await fetch(`/api/question-bank/${bankId}/question?limit=9999`);
        const qData = await qRes.json();
        if (!qData.success || qData.data.questions.length === 0) {
          toast('该题库没有题目', 'error');
          router.push('/study');
          return;
        }

        let qs: Question[] = qData.data.questions;
        if (order === 'desc') qs = [...qs].reverse();
        if (order === 'random') qs = [...qs].sort(() => Math.random() - 0.5);

        setQuestions(qs);
      } catch {
        toast('加载失败', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [bankId, order, router, toast]);

  const currentQuestion = questions[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, questions.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) goPrev();
      else goNext();
    }
  };

  const handleToggleFavorite = async () => {
    if (!currentQuestion) return;
    const res = await fetch('/api/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: currentQuestion.id, bankId: Number(bankId) }),
    });
    const data = await res.json();
    if (data.success) {
      setFavoriteOverrides((prev) => ({
        ...prev,
        [currentQuestion.id]: data.data.favorited,
      }));
      toast(data.data.favorited ? '已收藏' : '已取消收藏', 'success');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full mx-auto" />
        <p className="text-content-secondary mt-4">加载中...</p>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const favorited = favoriteOverrides[currentQuestion.id] ?? Boolean(currentQuestion.is_favorite);

  return (
    <div
      ref={containerRef}
      className="max-w-2xl mx-auto px-4 py-6 min-h-[calc(100vh-4rem)] flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-content-secondary">{bankName}</p>
          <p className="text-lg font-semibold text-content-primary">
            {currentIndex + 1} / {questions.length}
          </p>
        </div>
        <button
          onClick={handleToggleFavorite}
          className="p-2 rounded-xl hover:bg-surface-tertiary transition-colors cursor-pointer"
        >
          <Star className={cn('w-5 h-5', favorited ? 'text-warning fill-warning' : 'text-content-secondary')} />
        </button>
      </div>

      <div className="bg-surface-tertiary rounded-full h-1.5 mb-8 overflow-hidden">
        <div
          className="bg-accent h-full rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex-1">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Badge>{currentQuestion.type === 'single' ? '单选' : currentQuestion.type === 'multiple' ? '多选' : '不定项'}</Badge>
            {hasQuestionLevelAiFlags(currentQuestion.ai_flags) && <Badge variant="warning">AI补全</Badge>}
            {hasAnswerAiFlags(currentQuestion.ai_flags) && <Badge variant="warning">答案含AI补全</Badge>}
            {hasOptionAiFlags(currentQuestion.ai_flags) && <Badge variant="warning">选项含AI补全</Badge>}
            {hasExplanationAiFlags(currentQuestion.ai_flags) && <Badge variant="warning">解析含AI补全</Badge>}
          </div>
          <p className="text-content-primary text-lg leading-relaxed whitespace-pre-wrap">
            {currentQuestion.stem}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {currentQuestion.options.map((opt) => {
            const isCorrect = currentQuestion.answer.includes(opt.label);
            return (
              <div
                key={opt.label}
                className={cn(
                  'px-5 py-4 rounded-xl border-2 transition-colors',
                  isCorrect
                    ? 'border-success bg-success/10'
                    : 'border-border bg-surface-secondary opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium shrink-0',
                    isCorrect ? 'bg-success text-white' : 'bg-surface-tertiary text-content-secondary'
                  )}>
                    {isCorrect ? <CheckCircle className="w-5 h-5" /> : opt.label}
                  </span>
                  <span className="text-content-primary">{opt.content}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm text-content-secondary">
          <span className="font-medium text-accent">答案：</span>
          <span>{currentQuestion.answer || '未识别'}</span>
        </div>

        {currentQuestion.explanation && (
          <div className="bg-surface-secondary border border-border rounded-xl p-5 mb-6">
            <p className="text-sm font-medium text-accent mb-2">解析</p>
            <p className="text-content-secondary leading-relaxed whitespace-pre-wrap">
              {currentQuestion.explanation}
            </p>
            {currentQuestion.ai_flags.length > 0 && (
              <p className="text-xs text-content-secondary mt-3">
                AI标记：{currentQuestion.ai_flags.join('、')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between py-4 border-t border-border mt-auto">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronUp className="w-5 h-5" />
          <span className="text-sm">上一题</span>
        </button>

        <span className="text-sm text-content-secondary">
          上下滑动翻页
        </span>

        <button
          onClick={goNext}
          disabled={currentIndex >= questions.length - 1}
          className="flex items-center gap-1 px-4 py-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="text-sm">下一题</span>
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
