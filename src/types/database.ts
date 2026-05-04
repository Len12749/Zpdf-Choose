export interface QuestionBankRow {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
}

export interface QuestionRow {
  id: number;
  bank_id: number;
  number: number;
  stem: string;
  options: string;
  answer: string;
  explanation: string;
  is_ai_generated: number;
  ai_flags: string;
  type: 'single' | 'multiple' | 'indefinite';
  source_page: number | null;
  answer_source_page: number | null;
  created_at: string;
  updated_at: string;
}

export interface WrongAnswerRow {
  id: number;
  question_id: number;
  bank_id: number;
  wrong_count: number;
  last_wrong_at: string;
}

export interface FavoriteRow {
  id: number;
  question_id: number;
  bank_id: number;
  created_at: string;
}
