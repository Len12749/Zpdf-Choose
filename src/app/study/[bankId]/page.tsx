'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Star, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { Question } from '@/types/question';
import { cn } from '@/lib/utils';
import { hasAnswerAiFlags, hasExplanationAiFlags, hasOptionAiFlags, hasQuestionLevelAiFlags } from '@/lib/ai-flags';

type GestureLock = 'horizontal' | 'vertical' | null;

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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTransition, setSuppressTransition] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const gestureLock = useRef<GestureLock>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const prevQuestion = questions[currentIndex - 1];
  const nextQuestion = questions[currentIndex + 1];

  const goNext = useCallback(() => {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, questions.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (swipeTimer.current) clearTimeout(swipeTimer.current);
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    gestureLock.current = null;
    setSuppressTransition(false);
    setIsDragging(true);
    setDragOffset(0);
  };

  const getSwipeWidth = () => containerRef.current?.clientWidth || window.innerWidth || 360;

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!gestureLock.current && (absX > 8 || absY > 8)) {
      gestureLock.current = absX > absY * 1.15 ? 'horizontal' : 'vertical';
    }

    if (gestureLock.current !== 'horizontal') return;

    e.preventDefault();
    const blockedAtStart = deltaX > 0 && currentIndex === 0;
    const blockedAtEnd = deltaX < 0 && currentIndex >= questions.length - 1;
    setDragOffset(blockedAtStart || blockedAtEnd ? deltaX * 0.28 : deltaX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (gestureLock.current !== 'horizontal') {
      setIsDragging(false);
      setDragOffset(0);
      gestureLock.current = null;
      return;
    }

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const width = getSwipeWidth();
    const threshold = Math.min(120, width * 0.24);
    const canGoPrev = deltaX > threshold && currentIndex > 0;
    const canGoNext = deltaX < -threshold && currentIndex < questions.length - 1;

    setIsDragging(false);

    if (canGoPrev || canGoNext) {
      const targetIndex = canGoPrev ? currentIndex - 1 : currentIndex + 1;
      setDragOffset(canGoPrev ? width : -width);
      swipeTimer.current = setTimeout(() => {
        setSuppressTransition(true);
        setCurrentIndex(targetIndex);
        setDragOffset(0);
        gestureLock.current = null;
        requestAnimationFrame(() => setSuppressTransition(false));
      }, 180);
    } else {
      setDragOffset(0);
      gestureLock.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (swipeTimer.current) clearTimeout(swipeTimer.current);
    };
  }, []);

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
  const trackTransition = isDragging || suppressTransition ? 'none' : 'transform 180ms ease-out';

  const renderQuestionContent = (question?: Question) => {
    if (!question) return <div className="min-h-80" />;

    return (
      <div className="flex-1">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge>{question.type === 'single' ? '单选' : question.type === 'multiple' ? '多选' : '不定项'}</Badge>
            {hasQuestionLevelAiFlags(question.ai_flags) && <Badge variant="warning">AI补全</Badge>}
            {hasAnswerAiFlags(question.ai_flags) && <Badge variant="warning">答案含AI补全</Badge>}
            {hasOptionAiFlags(question.ai_flags) && <Badge variant="warning">选项含AI补全</Badge>}
            {hasExplanationAiFlags(question.ai_flags) && <Badge variant="warning">解析含AI补全</Badge>}
          </div>
          <p className="text-content-primary text-lg leading-relaxed whitespace-pre-wrap">
            {question.stem}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {question.options.map((opt) => {
            const isCorrect = question.answer.includes(opt.label);
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
          <span>{question.answer || '未识别'}</span>
        </div>

        {question.explanation && (
          <div className="bg-surface-secondary border border-border rounded-xl p-5 mb-6">
            <p className="text-sm font-medium text-accent mb-2">解析</p>
            <p className="text-content-secondary leading-relaxed whitespace-pre-wrap">
              {question.explanation}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="max-w-2xl mx-auto px-4 py-6 min-h-[calc(100vh-4rem)] flex flex-col"
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

      <div
        className="-mx-4 flex-1 overflow-hidden touch-pan-y md:mx-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            transform: `translate3d(calc(-100% + ${dragOffset}px), 0, 0)`,
            transition: trackTransition,
          }}
        >
          {[prevQuestion, currentQuestion, nextQuestion].map((question, index) => (
            <div
              key={question?.id ?? `empty-${index}`}
              className={cn(
                'w-full shrink-0 px-4 md:px-0',
                index !== 1 && 'opacity-80'
              )}
              aria-hidden={index !== 1}
            >
              {renderQuestionContent(question)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between py-4 border-t border-border mt-auto">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">上一题</span>
        </button>

        <span className="text-sm text-content-secondary">
          移动端可左右滑动切题
        </span>

        <button
          onClick={goNext}
          disabled={currentIndex >= questions.length - 1}
          className="flex items-center gap-1 px-4 py-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="text-sm">下一题</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
