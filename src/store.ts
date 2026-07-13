import type { QuestionBank, QuestionStatus } from './types'
import { sampleBanks } from './data'

const BANKS_KEY = 'npee:banks:v1'
const STATUS_KEY = 'npee:status:v1'
const NAVIGATION_KEY = 'npee:navigation:v1'
const VALID_STATUSES = new Set<QuestionStatus>(['none', 'proficient', 'vague', 'wrong'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 必须是非空文本`)
  return value.trim()
}

function optionalString(value: unknown, path: string) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${path} 必须是文本`)
  return value.trim()
}

function optionalStringArray(value: unknown, path: string) {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${path} 必须是非空文本数组`)
  return value.map(item => item.trim())
}

export function loadBanks(): QuestionBank[] {
  try { const raw = localStorage.getItem(BANKS_KEY); return raw ? validateBanks(JSON.parse(raw)) : sampleBanks } catch { return sampleBanks }
}
export function saveBanks(banks: QuestionBank[]) { localStorage.setItem(BANKS_KEY, JSON.stringify(banks)) }
export function loadStatuses(): Record<string, QuestionStatus> {
  try {
    return validateStatuses(JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'))
  } catch { return {} }
}
export function saveStatuses(statuses: Record<string, QuestionStatus>) { localStorage.setItem(STATUS_KEY, JSON.stringify(statuses)) }

export interface NavigationState {
  bankId: string
  sectionId: string
  questionId: string
  view: 'section' | 'wrong'
}

export function loadNavigation(): NavigationState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(NAVIGATION_KEY) || 'null')
    if (!isRecord(value) || typeof value.bankId !== 'string' || typeof value.sectionId !== 'string' || typeof value.questionId !== 'string') return null
    return { bankId: value.bankId, sectionId: value.sectionId, questionId: value.questionId, view: value.view === 'wrong' ? 'wrong' : 'section' }
  } catch { return null }
}

export function saveNavigation(value: NavigationState) { localStorage.setItem(NAVIGATION_KEY, JSON.stringify(value)) }

export function renameBank(banks: QuestionBank[], bankId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return banks
  return banks.map(bank => bank.id === bankId ? { ...bank, name: trimmed } : bank)
}

export function renameChapter(banks: QuestionBank[], bankId: string, chapterId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return banks
  return banks.map(bank => bank.id === bankId ? { ...bank, chapters: bank.chapters.map(chapter => chapter.id === chapterId ? { ...chapter, name: trimmed } : chapter) } : bank)
}

export function validateStatuses(value: unknown): Record<string, QuestionStatus> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, QuestionStatus] => VALID_STATUSES.has(entry[1] as QuestionStatus)))
}

export function validateBanks(value: unknown): QuestionBank[] {
  const banks = Array.isArray(value) ? value : isRecord(value) ? value.banks : undefined
  if (!Array.isArray(banks) || !banks.length) throw new Error('文件中没有题库数据')
  const seen = new Set<string>()
  const uniqueId = (value: unknown, path: string) => {
    const id = requiredString(value, path)
    if (seen.has(id)) throw new Error(`${path} 与其他条目重复：${id}`)
    seen.add(id)
    return id
  }
  return banks.map((rawBank, bankIndex) => {
    const path = `题库 ${bankIndex + 1}`
    if (!isRecord(rawBank)) throw new Error(`${path} 格式不正确`)
    if (!Array.isArray(rawBank.chapters)) throw new Error(`${path}.chapters 必须是数组`)
    return {
      id: uniqueId(rawBank.id, `${path}.id`),
      name: requiredString(rawBank.name, `${path}.name`),
      description: optionalString(rawBank.description, `${path}.description`),
      source: rawBank.source === 'remote' ? 'remote' : 'local',
      chapters: rawBank.chapters.map((rawChapter, chapterIndex) => {
        const chapterPath = `${path}.chapters[${chapterIndex}]`
        if (!isRecord(rawChapter) || !Array.isArray(rawChapter.sections)) throw new Error(`${chapterPath} 缺少 sections 数组`)
        return {
          id: uniqueId(rawChapter.id, `${chapterPath}.id`),
          name: requiredString(rawChapter.name, `${chapterPath}.name`),
          sections: rawChapter.sections.map((rawSection, sectionIndex) => {
            const sectionPath = `${chapterPath}.sections[${sectionIndex}]`
            if (!isRecord(rawSection) || !Array.isArray(rawSection.questions)) throw new Error(`${sectionPath} 缺少 questions 数组`)
            return {
              id: uniqueId(rawSection.id, `${sectionPath}.id`),
              name: requiredString(rawSection.name, `${sectionPath}.name`),
              questions: rawSection.questions.map((rawQuestion, questionIndex) => {
                const questionPath = `${sectionPath}.questions[${questionIndex}]`
                if (!isRecord(rawQuestion)) throw new Error(`${questionPath} 格式不正确`)
                if (!Number.isFinite(rawQuestion.number)) throw new Error(`${questionPath}.number 必须是数字`)
                if (rawQuestion.options !== undefined && (!Array.isArray(rawQuestion.options) || rawQuestion.options.some(option => typeof option !== 'string')))
                  throw new Error(`${questionPath}.options 必须是文本数组`)
                const type = requiredString(rawQuestion.type, `${questionPath}.type`)
                const imageUrl = optionalString(rawQuestion.imageUrl, `${questionPath}.imageUrl`)
                const imageKeys = optionalStringArray(rawQuestion.imageKeys, `${questionPath}.imageKeys`)
                const text = typeof rawQuestion.text === 'string' && rawQuestion.text.trim() === '' && (type === '图片题' || imageUrl || imageKeys?.length)
                  ? ''
                  : requiredString(rawQuestion.text, `${questionPath}.text`)
                return {
                  id: uniqueId(rawQuestion.id, `${questionPath}.id`),
                  number: rawQuestion.number as number,
                  type,
                  text,
                  options: rawQuestion.options as string[] | undefined,
                  answer: requiredString(rawQuestion.answer, `${questionPath}.answer`),
                  analysis: requiredString(rawQuestion.analysis, `${questionPath}.analysis`),
                  imageUrl,
                  answerImageUrl: optionalString(rawQuestion.answerImageUrl, `${questionPath}.answerImageUrl`),
                  imageKeys,
                  answerImageKeys: optionalStringArray(rawQuestion.answerImageKeys, `${questionPath}.answerImageKeys`),
                  videoUrl: optionalString(rawQuestion.videoUrl, `${questionPath}.videoUrl`)
                }
              })
            }
          })
        }
      })
    }
  })
}
