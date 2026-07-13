export type QuestionStatus = 'none' | 'proficient' | 'vague' | 'wrong'

export interface Question {
  id: string
  number: number
  type: string
  text: string
  options?: string[]
  answer: string
  analysis: string
  imageUrl?: string
  answerImageUrl?: string
  imageKeys?: string[]
  answerImageKeys?: string[]
  videoUrl?: string
}

export interface Section { id: string; name: string; questions: Question[] }
export interface Chapter { id: string; name: string; sections: Section[] }
export interface QuestionBank { id: string; name: string; description?: string; source: 'local' | 'remote'; chapters: Chapter[] }
export interface BankExport { version: 1; banks: QuestionBank[] }
