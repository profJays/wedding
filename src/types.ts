export interface AnswerOption {
  id: string;
  text: string;
  verdict: string;
  isFatal?: boolean; // For White dress in Q5
  personaTag?: string;
}

export interface Question {
  id: number;
  question: string;
  subtitle?: string;
  options: AnswerOption[];
}

export type QuizStep = 'welcome' | 'quiz' | 'uninvited' | 'approved';

export interface QuizState {
  currentQuestionIndex: number;
  answers: Record<number, string>; // questionId -> optionId
  guestName: string;
  selectedOptionForCurrentQ: AnswerOption | null;
  hasShownReaction: boolean;
}
