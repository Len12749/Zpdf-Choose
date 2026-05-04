'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, ArrowRight, RotateCcw, Home, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useQuizState } from '@/hooks/useQuizState';
import { useToast } from '@/components/ui/Toast';
import { Question } from '@/types/question';
import { cn } from '@/lib/utils';
import { hasAnswerAiFlags, hasExplanationAiFlags, hasOptionAiFlags, hasQuestionLevelAiFlags } from '@/lib/ai-flags';

function QuizSessionPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const bankId = params.bankId as string;
  const order = searchParams.get('order') || 'asc';

  const {
    state,
    currentQuestion,
    isMultiple,
    loadQuestions,
    selectAnswer,
    toggleMultiAnswer,
    confirm,
    nextQuestion,
    progress,
    wrongCount,
  } = useQuizState();

  const [bankName, setBankName] = useState('');
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<number, boolean>>({});

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
          router.push('/quiz');
          return;
        }

        let questions: Question[] = qData.data.questions;
        if (order === 'desc') questions = [...questions].reverse();
        if (order === 'random') questions = [...questions].sort(() => Math.random() - 0.5);

        loadQuestions(questions);
      } catch {
        toast('加载失败', 'error');
      }
    };
    load();
  }, [bankId, order, loadQuestions, router, toast]);

  const handleConfirm = async () => {
    confirm();
    const isCorrect = state.selectedAnswer === currentQuestion?.answer ||
      (isMultiple && state.selectedAnswer?.split('').sort().join('') === currentQuestion?.answer.split('').sort().join(''));

    if (!isCorrect && currentQuestion) {
      await fetch('/api/wrong-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: currentQuestion.id, bankId: Number(bankId) }),
      });
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

  const handleOptionClick = (label: string) => {
    if (state.status === 'revealed' || state.status === 'completed') return;
    if (isMultiple) {
      toggleMultiAnswer(label);
    } else {
      selectAnswer(label);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full mx-auto" />
        <p className="text-content-secondary mt-4">加载题目中...</p>
      </div>
    );
  }

  if (state.status === 'completed') {
    const total = state.questions.length;
    const correct = state.correctCount;
    const wrong = wrongCount;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-24 h-24 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl font-bold text-accent">{accuracy}%</span>
        </div>
        <h1 className="text-2xl font-bold text-content-primary mb-2">练习完成</h1>
        <p className="text-content-secondary mb-8">{bankName}</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-surface-secondary rounded-xl p-4">
            <p className="text-2xl font-bold text-content-primary">{total}</p>
            <p className="text-sm text-content-secondary">总题数</p>
          </div>
          <div className="bg-surface-secondary rounded-xl p-4">
            <p className="text-2xl font-bold text-success">{correct}</p>
            <p className="text-sm text-content-secondary">答对</p>
          </div>
          <div className="bg-surface-secondary rounded-xl p-4">
            <p className="text-2xl font-bold text-error">{wrong}</p>
            <p className="text-sm text-content-secondary">答错</p>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Button variant="secondary" onClick={() => router.push('/')} icon={<Home className="w-4 h-4" />}>
            返回首页
          </Button>
          <Button onClick={() => router.push('/quiz')} icon={<RotateCcw className="w-4 h-4" />}>
            再来一次
          </Button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const isRevealed = state.status === 'revealed';
  const favorited = favoriteOverrides[currentQuestion.id] ?? Boolean(currentQuestion.is_favorite);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-content-secondary">{bankName}</p>
          <p className="text-lg font-semibold text-content-primary">
            第 {progress.current} / {progress.total} 题
          </p>
        </div>
        <div className="flex items-center gap-2">
          {wrongCount > 0 && <Badge variant="error">错 {wrongCount}</Badge>}
          <button
            onClick={handleToggleFavorite}
            className="p-2 rounded-xl hover:bg-surface-tertiary transition-colors cursor-pointer"
          >
            <Star className={cn('w-5 h-5', favorited ? 'text-warning fill-warning' : 'text-content-secondary')} />
          </button>
        </div>
      </div>

      <div className="bg-surface-tertiary rounded-full h-1.5 mb-8 overflow-hidden">
        <div
          className="bg-accent h-full rounded-full transition-all duration-300"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>

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

      <div className="space-y-3 mb-8">
        {currentQuestion.options.map((opt) => {
          const isSelected = state.selectedAnswer?.includes(opt.label);
          const isCorrectAnswer = currentQuestion.answer.includes(opt.label);
          const showCorrect = isRevealed && isCorrectAnswer;
          const showWrong = isRevealed && isSelected && !isCorrectAnswer;

          return (
            <button
              key={opt.label}
              onClick={() => handleOptionClick(opt.label)}
              disabled={isRevealed}
              className={cn(
                'w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-200 cursor-pointer',
                'disabled:cursor-default',
                !isSelected && !isRevealed && 'border-border hover:border-accent/30 bg-surface-secondary',
                isSelected && !isRevealed && 'border-accent bg-accent/10',
                showCorrect && 'border-success bg-success/10',
                showWrong && 'border-error bg-error/10',
                isRevealed && !isSelected && !isCorrectAnswer && 'border-border bg-surface-secondary opacity-60',
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium shrink-0',
                  !isSelected && !isRevealed && 'bg-surface-tertiary text-content-secondary',
                  isSelected && !isRevealed && 'bg-accent text-white',
                  showCorrect && 'bg-success text-white',
                  showWrong && 'bg-error text-white',
                  isRevealed && !isSelected && !isCorrectAnswer && 'bg-surface-tertiary text-content-secondary',
                )}>
                  {showCorrect ? <CheckCircle className="w-5 h-5" /> : showWrong ? <XCircle className="w-5 h-5" /> : opt.label}
                </span>
                <span className="text-content-primary">{opt.content}</span>
              </div>
            </button>
          );
        })}
      </div>

      {isRevealed && (
        <div className="mb-4 flex items-center gap-2 text-sm text-content-secondary">
          <span className="font-medium text-accent">答案：</span>
          <span>{currentQuestion.answer || '未识别'}</span>
        </div>
      )}

      {isRevealed && currentQuestion.explanation && (
        <div className="bg-surface-secondary border border-border rounded-xl p-5 mb-8">
          <p className="text-sm font-medium text-accent mb-2">解析</p>
          <p className="text-content-secondary leading-relaxed whitespace-pre-wrap">
            {currentQuestion.explanation}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        {!isRevealed ? (
          <Button onClick={handleConfirm} disabled={!state.selectedAnswer} size="lg">
            确认
          </Button>
        ) : (
          <Button onClick={nextQuestion} size="lg" icon={<ArrowRight className="w-4 h-4" />}>
            {progress.current >= progress.total ? '查看结果' : '下一题'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function QuizSessionPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full mx-auto" />
        <p className="text-content-secondary mt-4">加载题目中...</p>
      </div>
    }>
      <QuizSessionPageInner />
    </Suspense>
  );
}
