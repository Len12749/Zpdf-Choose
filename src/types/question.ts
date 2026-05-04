export interface Option {
  label: string;
  content: string;
}

export type QuestionType = 'single' | 'multiple' | 'indefinite';

export interface Question {
  id: number;
  bank_id: number;
  number: number;
  stem: string;
  options: Option[];
  answer: string;
  explanation: string;
  is_ai_generated: boolean;
  ai_flags: string[];
  type: QuestionType;
  source_page: number | null;
  answer_source_page?: number | null;
  created_at: string;
  updated_at: string;
  is_favorite?: boolean;
  wrong_count?: number;
}

export interface ExtractionResult {
  questions?: ExtractedQuestion[];
  answers_only?: ExtractedAnswer[];
  has_answer_page?: boolean;
  answer_page_start?: number | null;
}

export interface ExtractedQuestion {
  number?: number | null;
  stem: string;
  options: Option[];
  answer: string;
  explanation: string;
  type?: QuestionType;
  source_page?: number;
  is_ai_generated?: boolean;
  ai_flags?: string[];
  stem_continued_from_page?: number | null;
  answer_source_page?: number | null;
}

export interface ExtractedAnswer {
  number: number | null;
  answer: string;
  explanation: string;
}

export interface MergedQuestion {
  number: number;
  stem: string;
  options: Option[];
  answer: string;
  explanation: string;
  type: QuestionType;
  is_ai_generated: boolean;
  ai_flags: string[];
  source_page: number | null;
  answer_source_page?: number | null;
}
