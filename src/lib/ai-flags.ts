const ANSWER_FLAGS = new Set([
  'missing_answer_inferred',
  'missing_answer_unresolved',
]);

const EXPLANATION_FLAGS = new Set([
  'missing_explanation_inferred',
  'missing_explanation_unresolved',
]);

const OPTION_FLAGS = new Set([
  'missing_options_inferred',
  'options_inferred',
  'options_rebuilt',
]);

const QUESTION_FLAGS = new Set([
  'missing_question_rebuilt',
  'cross_page_stem_rebuilt',
]);

export function hasQuestionLevelAiFlags(flags: string[]): boolean {
  return flags.some((flag) => QUESTION_FLAGS.has(flag));
}

export function hasExplanationAiFlags(flags: string[]): boolean {
  return flags.some((flag) => EXPLANATION_FLAGS.has(flag));
}

export function hasAnswerAiFlags(flags: string[]): boolean {
  return flags.some((flag) => ANSWER_FLAGS.has(flag));
}

export function hasOptionAiFlags(flags: string[]): boolean {
  return flags.some((flag) => OPTION_FLAGS.has(flag));
}
