import { ExtractedAnswer, ExtractedQuestion, ExtractionResult, MergedQuestion, Option, QuestionType } from '@/types/question';
import { reviewBoundaryMerge } from './siliconflow';
import { normalizeAnswer } from './question-utils';
import { processInParallel } from './parallel-processor';

interface WorkingQuestion {
  stem: string;
  options: Option[];
  answer: string;
  explanation: string;
  type: QuestionType;
  is_ai_generated: boolean;
  ai_flags: Set<string>;
  source_page: number | null;
  answer_source_page: number | null;
  original_numbers: number[];
}

interface AnswerEntry {
  declaredNumber: number | null;
  answer: string;
  explanation: string;
  sourcePage: number;
}

interface PageBucket {
  pageNumber: number;
  questions: WorkingQuestion[];
  answersOnly: AnswerEntry[];
}

export async function mergeExtractionResults(
  pageResults: { pageNumber: number; data: ExtractionResult }[],
  onProgress?: (completed: number, total: number) => void
): Promise<MergedQuestion[]> {
  const pageBuckets = [...pageResults]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(({ pageNumber, data }) => ({
      pageNumber,
      questions: normalizeExtractedQuestions(data.questions || [], pageNumber),
      answersOnly: normalizeAnswersOnly(data.answers_only || [], pageNumber),
    }));

  await reviewAdjacentBoundaries(pageBuckets, onProgress);

  const mergedQuestions = pageBuckets.flatMap((bucket) => bucket.questions);
  assignAnswersBySequence(mergedQuestions, pageBuckets.flatMap((bucket) => bucket.answersOnly));

  return mergedQuestions
    .filter(isCompleteQuestionCandidate)
    .map((question, index) => ({
      number: index + 1,
      stem: question.stem,
      options: dedupeOptions(question.options),
      answer: question.answer,
      explanation: question.explanation,
      type: question.type,
      is_ai_generated: question.is_ai_generated || question.ai_flags.size > 0,
      ai_flags: Array.from(question.ai_flags),
      source_page: question.source_page,
      answer_source_page: question.answer_source_page ?? null,
    }));
}

function isCompleteQuestionCandidate(question: WorkingQuestion): boolean {
  return Boolean(question.stem.trim()) && question.options.length > 0;
}

async function reviewAdjacentBoundaries(
  pageBuckets: PageBucket[],
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const boundaryCandidates = pageBuckets.slice(0, -1).map((currentPage, index) => {
    const nextPage = pageBuckets[index + 1];
    const left = currentPage.questions.at(-1);
    const right = nextPage.questions[0];

    return {
      index,
      currentPage,
      nextPage,
      left,
      right,
    };
  });

  const reviewResults = await processInParallel(
    boundaryCandidates,
    async (candidate) => {
      if (!candidate.left || !candidate.right) {
        return { index: candidate.index, should_merge: false, reason: 'no_candidates', merged: undefined };
      }

      const audit = await reviewBoundaryMerge(
        serializeForAudit(candidate.left),
        serializeForAudit(candidate.right),
        candidate.currentPage.pageNumber,
        candidate.nextPage.pageNumber
      );

      return { index: candidate.index, ...audit };
    },
    10,
    onProgress
  );

  const reviews = reviewResults.map((result) => (
    result.result || { index: result.item.index, should_merge: false, reason: result.error ? String(result.error) : 'boundary_review_failed', merged: undefined }
  ));

  // 阶段2：按顺序应用合并结果，处理链式合并
  const consumed = new Set<number>();
  const aiMergedResults = new Map<number, NonNullable<(typeof reviews)[number]['merged']>>();

  for (const review of reviews) {
    if (!review.should_merge) continue;

    const { index } = review;
    const rightBucket = pageBuckets[index + 1];
    const rightQuestions = rightBucket.questions;
    if (rightQuestions.length === 0) continue;

    // 找到左边第一个未被消费的页
    let leftPageIndex = index;
    while (leftPageIndex >= 0 && consumed.has(leftPageIndex)) {
      leftPageIndex--;
    }
    if (leftPageIndex < 0) continue;

    const leftBucket = pageBuckets[leftPageIndex];
    const left = leftBucket.questions.at(-1)!;
    const right = rightQuestions[0];

    if (review.merged) {
      aiMergedResults.set(index, review.merged);
    }

    // 链式合并：优先使用当前边界的AI结果，否则用最近的AI结果，最后兜底用代码合并
    const aiResult = review.merged ?? aiMergedResults.get(leftPageIndex);

    if (aiResult) {
      leftBucket.questions[leftBucket.questions.length - 1] = {
        stem: aiResult.stem,
        options: aiResult.options,
        answer: aiResult.answer || left.answer || right.answer,
        explanation: aiResult.explanation || left.explanation || right.explanation,
        type: aiResult.type || mergeQuestionType(left.type, right.type),
        is_ai_generated: left.is_ai_generated || right.is_ai_generated,
        ai_flags: new Set([...left.ai_flags, ...right.ai_flags, 'cross_page_merged', 'ai_boundary_merged']),
        source_page: left.source_page ?? right.source_page,
        answer_source_page: (aiResult.answer ? leftBucket.pageNumber : null)
          ?? left.answer_source_page ?? right.answer_source_page ?? null,
        original_numbers: mergeOriginalNumbers(left.original_numbers, right.original_numbers),
      };
    } else {
      leftBucket.questions[leftBucket.questions.length - 1] = mergeTwoQuestions(left, right, rightBucket.pageNumber);
    }

    rightQuestions.shift();
    if (rightQuestions.length === 0) {
      consumed.add(index + 1);
    }
  }
}

function normalizeExtractedQuestions(questions: ExtractedQuestion[], pageNumber: number): WorkingQuestion[] {
  return questions
    .map(normalizeExtractedQuestion)
    .flatMap(splitCompoundQuestion)
    .map((question) => ({
      stem: question.stem.trim(),
      options: dedupeOptions(question.options || []),
      answer: normalizeAnswer(question.answer || ''),
      explanation: question.explanation?.trim() || '',
      type: question.type || 'single',
      is_ai_generated: question.is_ai_generated || false,
      ai_flags: new Set(question.ai_flags || []),
      source_page: pageNumber,
      answer_source_page: question.answer_source_page ?? null,
      original_numbers: getOriginalNumbers(question.number ?? null),
    }));
}

function normalizeExtractedQuestion(question: ExtractedQuestion): ExtractedQuestion {
  const partitioned = partitionStemAndOptions(stripLeadingQuestionNumber(question.stem || ''), question.options || []);
  return {
    ...question,
    stem: partitioned.stem.trim(),
    options: partitioned.options,
  };
}

function splitCompoundQuestion(question: ExtractedQuestion): ExtractedQuestion[] {
  const stem = question.stem?.trim() || '';
  if (!stem) {
    return [question];
  }

  const fragments = splitByQuestionBlanks(stem);
  if (fragments.length <= 1 || countQuestionBlanks(stem) < 2 || stem.length < 80) {
    return [question];
  }

  return fragments.map((fragment, index) => {
    const isLast = index === fragments.length - 1;
    return {
      ...question,
      stem: fragment,
      options: isLast ? question.options : [],
      answer: isLast ? question.answer : '',
      explanation: isLast ? question.explanation : '',
      ai_flags: isLast ? question.ai_flags : [...(question.ai_flags || []), 'compound_page_split'],
    };
  });
}

function normalizeAnswersOnly(answers: ExtractedAnswer[], pageNumber: number): AnswerEntry[] {
  return answers.map((answer) => ({
    declaredNumber: getDeclaredNumber(answer.number),
    answer: normalizeAnswer(answer.answer),
    explanation: answer.explanation?.trim() || '',
    sourcePage: pageNumber,
  }));
}

function assignAnswersBySequence(questions: WorkingQuestion[], answers: AnswerEntry[]): void {
  const unresolvedIndexes = questions
    .map((question, index) => (!question.answer ? index : -1))
    .filter((index) => index >= 0);

  let cursor = 0;

  for (const answerEntry of answers) {
    const hintedCursor = findHintedQuestionIndex(questions, unresolvedIndexes, cursor, answerEntry.declaredNumber);
    const targetCursor = hintedCursor >= 0 ? hintedCursor : cursor;
    const targetIndex = unresolvedIndexes[targetCursor];

    if (targetIndex === undefined) {
      continue;
    }

    const question = questions[targetIndex];
    question.answer = answerEntry.answer;
    if (!question.explanation && answerEntry.explanation) {
      question.explanation = answerEntry.explanation;
    }
    question.answer_source_page = answerEntry.sourcePage;
    cursor = targetCursor + 1;
  }
}

function mergeTwoQuestions(left: WorkingQuestion, right: WorkingQuestion, rightPageNumber: number): WorkingQuestion {
  const mergedAnswer = left.answer || right.answer;

  return {
    stem: joinUniqueText(left.stem, right.stem),
    options: dedupeOptions([...left.options, ...right.options]),
    answer: mergedAnswer,
    explanation: left.explanation || right.explanation,
    type: mergeQuestionType(left.type, right.type),
    is_ai_generated: left.is_ai_generated || right.is_ai_generated,
    ai_flags: new Set([...left.ai_flags, ...right.ai_flags, 'cross_page_merged']),
    source_page: left.source_page ?? right.source_page,
    answer_source_page: mergedAnswer
      ? (left.answer_source_page ?? right.answer_source_page ?? rightPageNumber)
      : (left.answer_source_page ?? right.answer_source_page ?? null),
    original_numbers: mergeOriginalNumbers(left.original_numbers, right.original_numbers),
  };
}

function serializeForAudit(question: WorkingQuestion) {
  return {
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
    type: question.type,
  };
}

function partitionStemAndOptions(stem: string, options: Option[]): { stem: string; options: Option[] } {
  const finalOptions: Option[] = [];
  const stemParts: string[] = [stem.trim()];

  for (const option of options) {
    if (!option?.label) {
      continue;
    }

    const label = option.label.trim().toUpperCase();
    const content = option.content?.trim() || '';

    if (isFinalOptionLabel(label)) {
      finalOptions.push({ label, content });
      continue;
    }

    if (content) {
      stemParts.push(`${label} ${content}`);
    }
  }

  return {
    stem: stemParts.filter(Boolean).join('\n'),
    options: dedupeOptions(finalOptions),
  };
}

function stripLeadingQuestionNumber(stem: string): string {
  return stem
    .replace(/^\s*第\s*\d+\s*题[.:：、．]?\s*/u, '')
    .replace(/^\s*\d+\s*[.．、:：]\s*/u, '')
    .trim();
}

function mergeQuestionType(left: QuestionType, right: QuestionType): QuestionType {
  if (left === right) {
    return left;
  }
  if (left === 'indefinite' || right === 'indefinite') {
    return 'indefinite';
  }
  if (left === 'multiple' || right === 'multiple') {
    return 'multiple';
  }
  return 'single';
}

function dedupeOptions(options: Option[]): Option[] {
  const optionMap = new Map<string, Option>();

  for (const option of options) {
    if (!option?.label) {
      continue;
    }

    const label = option.label.trim().toUpperCase();
    if (!isFinalOptionLabel(label)) {
      continue;
    }

    const content = option.content?.trim() || '';
    const existing = optionMap.get(label);
    if (!existing || content.length > existing.content.length) {
      optionMap.set(label, { label, content });
    }
  }

  return Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function isFinalOptionLabel(label: string): boolean {
  return /^[A-D]$/i.test(label.trim());
}

function splitByQuestionBlanks(stem: string): string[] {
  const matches = Array.from(stem.matchAll(/（\s*）|\(\s*\)|﹙\s*﹚/g));
  if (matches.length <= 1) {
    return [stem];
  }

  const fragments: string[] = [];
  let start = 0;

  for (const match of matches) {
    const end = (match.index || 0) + match[0].length;
    const fragment = stem.slice(start, end).trim();
    if (fragment) {
      fragments.push(fragment);
    }
    start = end;
  }

  const trailing = stem.slice(start).trim();
  if (trailing) {
    if (fragments.length > 0) {
      fragments[fragments.length - 1] = `${fragments[fragments.length - 1]}${trailing.startsWith('。') || trailing.startsWith('，') ? '' : '\n'}${trailing}`;
    } else {
      fragments.push(trailing);
    }
  }

  return fragments.filter(Boolean);
}

function countQuestionBlanks(value: string): number {
  return (value.match(/（\s*）|\(\s*\)|﹙\s*﹚/g) || []).length;
}

function joinUniqueText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}\n${right}`;
}

function getDeclaredNumber(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function getOriginalNumbers(value: number | null): number[] {
  const declaredNumber = getDeclaredNumber(value);
  return declaredNumber ? [declaredNumber] : [];
}

function mergeOriginalNumbers(left: number[], right: number[]): number[] {
  return Array.from(new Set([...left, ...right])).filter((value) => Number.isFinite(value));
}

function findHintedQuestionIndex(
  questions: WorkingQuestion[],
  unresolvedIndexes: number[],
  cursor: number,
  declaredNumber: number | null
): number {
  if (!declaredNumber) {
    return -1;
  }

  for (let offset = 0; offset < 3; offset += 1) {
    const unresolvedCursor = cursor + offset;
    const questionIndex = unresolvedIndexes[unresolvedCursor];
    if (questionIndex === undefined) {
      break;
    }

    if (questions[questionIndex].original_numbers.includes(declaredNumber)) {
      return unresolvedCursor;
    }
  }

  return -1;
}
