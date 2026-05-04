'use client';

import { useState, useCallback, useRef } from 'react';
import { Question } from '@/types/question';

export type QuizStatus = 'loading' | 'active' | 'selected' | 'revealed' | 'completed';

export interface QuizState {
  status: QuizStatus;
  questions: Question[];
  currentIndex: number;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  wrongIds: Set<number>;
  correctCount: number;
}

export function useQuizState() {
  const [state, setState] = useState<QuizState>({
    status: 'loading',
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    isCorrect: null,
    wrongIds: new Set(),
    correctCount: 0,
  });

  const wrongIdsRef = useRef(new Set<number>());

  const loadQuestions = useCallback((questions: Question[]) => {
    setState({
      status: 'active',
      questions,
      currentIndex: 0,
      selectedAnswer: null,
      isCorrect: null,
      wrongIds: new Set(),
      correctCount: 0,
    });
    wrongIdsRef.current = new Set();
  }, []);

  const selectAnswer = useCallback((answer: string) => {
    setState((s) => {
      if (s.status !== 'active' && s.status !== 'selected') return s;
      const newAnswer = s.selectedAnswer === answer ? null : answer;
      return { ...s, status: newAnswer ? 'selected' : 'active', selectedAnswer: newAnswer };
    });
  }, []);

  const toggleMultiAnswer = useCallback((label: string) => {
    setState((s) => {
      if (s.status !== 'active' && s.status !== 'selected') return s;
      const current = s.selectedAnswer || '';
      const newAnswer = current.includes(label)
        ? current.replace(label, '')
        : (current + label).split('').sort().join('');
      return { ...s, status: newAnswer ? 'selected' : 'active', selectedAnswer: newAnswer };
    });
  }, []);

  const confirm = useCallback(() => {
    setState((s) => {
      if (s.status !== 'selected' || !s.selectedAnswer) return s;
      const q = s.questions[s.currentIndex];
      const correct = q.type === 'single'
        ? s.selectedAnswer === q.answer
        : s.selectedAnswer.split('').sort().join('') === q.answer.split('').sort().join('');

      if (!correct) {
        wrongIdsRef.current.add(q.id);
      }

      return {
        ...s,
        status: 'revealed',
        isCorrect: correct,
        wrongIds: new Set(wrongIdsRef.current),
        correctCount: correct ? s.correctCount + 1 : s.correctCount,
      };
    });
  }, []);

  const nextQuestion = useCallback(() => {
    setState((s) => {
      if (s.status !== 'revealed') return s;
      const nextIdx = s.currentIndex + 1;
      if (nextIdx >= s.questions.length) {
        return { ...s, status: 'completed' };
      }
      return {
        ...s,
        status: 'active',
        currentIndex: nextIdx,
        selectedAnswer: null,
        isCorrect: null,
      };
    });
  }, []);

  const currentQuestion = state.questions[state.currentIndex];
  const isMultiple = currentQuestion?.type === 'multiple' || currentQuestion?.type === 'indefinite';

  return {
    state,
    currentQuestion,
    isMultiple,
    loadQuestions,
    selectAnswer,
    toggleMultiAnswer,
    confirm,
    nextQuestion,
    progress: {
      current: state.currentIndex + 1,
      total: state.questions.length,
    },
    wrongCount: state.wrongIds.size,
  };
}
