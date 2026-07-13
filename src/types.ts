export type QuestionStatus = 'none' | 'proficient' | 'vague' | 'wrong'
export type ReadingQuestionType = 'detail' | 'example' | 'main-idea' | 'attitude' | 'inference' | 'vocabulary'
export type PartBKind = 'ordering' | 'sentence' | 'subheading' | 'viewpoint'

export interface Question {
  id: string
  number: number
  type?: string
  text: string
  options?: string[]
  answer: string
  analysis: string
  imageUrl?: string
  answerImageUrl?: string
  imageKeys?: string[]
  answerImageKeys?: string[]
  videoUrl?: string
  readingType?: ReadingQuestionType
}

export interface Section {
  id: string
  name: string
  questions: Question[]
  passage?: string
  passageImageUrls?: string[]
  partBKind?: PartBKind
  partBSequence?: string
}
export interface Chapter { id: string; name: string; sections: Section[] }
export interface QuestionBank { id: string; name: string; description?: string; source: 'local' | 'remote'; chapters: Chapter[] }
export interface BankExport { version: 1; banks: QuestionBank[] }
