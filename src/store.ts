import type { PartBKind, QuestionBank, QuestionStatus, ReadingQuestionType } from './types'
import { builtInBanks } from './data'
import { mergeStudyActivities, validateStudyActivities, type StudyActivity } from './studyActivity'

const BANKS_KEY = 'npee:banks:v1'
const BUILTIN_SEED_KEY = 'npee:builtins:english-exams:v8'
const STATUS_KEY = 'npee:status:v1'
const NAVIGATION_KEY = 'npee:navigation:v1'
const ACTIVITY_KEY = 'npee:activity:v1'
const VALID_STATUSES = new Set<QuestionStatus>(['none', 'proficient', 'vague', 'wrong'])
const VALID_READING_TYPES = new Set<ReadingQuestionType>(['detail', 'example', 'main-idea', 'attitude', 'inference', 'vocabulary'])
const VALID_PART_B_KINDS = new Set<PartBKind>(['ordering', 'sentence', 'subheading', 'viewpoint'])
const REMOVED_BANK_IDS = new Set(['local-calculus', 'local-linear'])
const LEGACY_ENGLISH_BANK_ID = /^english-20\d{2}$/
const ENGLISH_BANK_ID = 'english-exams'

interface StoredBanksV2 {
  version: 2
  bankOrder: string[]
  /** Only custom banks and user-modified built-ins are stored in full. */
  banks: QuestionBank[]
}

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

function trySetItem(key: string, value: string) {
  try { localStorage.setItem(key, value); return true } catch { return false }
}

function decodeStoredBanks(value: unknown): QuestionBank[] {
  if (!isRecord(value) || value.version !== 2) return validateBanks(value)
  if (!Array.isArray(value.bankOrder) || !value.bankOrder.length || value.bankOrder.some(id => typeof id !== 'string' || !id))
    throw new Error('题库缓存顺序无效')
  const originalBankOrder = value.bankOrder as string[]
  const firstLegacyEnglishIndex = originalBankOrder.findIndex(id => LEGACY_ENGLISH_BANK_ID.test(id))
  const bankOrder = originalBankOrder.filter(id => !LEGACY_ENGLISH_BANK_ID.test(id))
  if (firstLegacyEnglishIndex >= 0 && !bankOrder.includes(ENGLISH_BANK_ID) && builtInBanks.some(bank => bank.id === ENGLISH_BANK_ID))
    bankOrder.splice(Math.min(firstLegacyEnglishIndex, bankOrder.length), 0, ENGLISH_BANK_ID)
  if (new Set(bankOrder).size !== bankOrder.length) throw new Error('题库缓存顺序包含重复项')
  if (!Array.isArray(value.banks)) throw new Error('题库缓存内容无效')
  const overrides = value.banks.length ? validateBanks(value.banks).filter(bank => !LEGACY_ENGLISH_BANK_ID.test(bank.id)) : []
  const overrideById = new Map(overrides.map(bank => [bank.id, bank]))
  const builtInBankById = new Map(builtInBanks.map(bank => [bank.id, bank]))
  if (overrides.some(bank => !bankOrder.includes(bank.id))) throw new Error('题库缓存包含无效条目')
  const restored = bankOrder.map(id => overrideById.get(id) || builtInBankById.get(id)).filter((bank): bank is QuestionBank => Boolean(bank))
  if (restored.length !== bankOrder.length) throw new Error('题库缓存引用不存在')
  return validateBanks(structuredClone(restored))
}

function encodeStoredBanks(banks: QuestionBank[]): StoredBanksV2 {
  const builtInBankJsonById = new Map(builtInBanks.map(bank => [bank.id, JSON.stringify(bank)]))
  return {
    version: 2,
    bankOrder: banks.map(bank => bank.id),
    banks: banks.filter(bank => builtInBankJsonById.get(bank.id) !== JSON.stringify(bank))
  }
}

export function loadBanks(): QuestionBank[] {
  try {
    const raw = localStorage.getItem(BANKS_KEY)
    if (!raw) {
      trySetItem(BUILTIN_SEED_KEY, '1')
      return structuredClone(builtInBanks)
    }
    const cached = decodeStoredBanks(JSON.parse(raw)).filter(bank => !REMOVED_BANK_IDS.has(bank.id))
    if (localStorage.getItem(BUILTIN_SEED_KEY)) return cached
    const cachedIds = new Set(cached.map(bank => bank.id))
    const missingOtherBuiltIns = builtInBanks.filter(bank => !bank.id.startsWith('english-') && !cachedIds.has(bank.id))
    const refreshedEnglish = builtInBanks.filter(bank => bank.id.startsWith('english-'))
    const seeded = [...cached.filter(bank => !bank.id.startsWith('english-')), ...structuredClone(missingOtherBuiltIns), ...structuredClone(refreshedEnglish)]
    saveBanks(seeded)
    return seeded
  } catch {
    trySetItem(BUILTIN_SEED_KEY, '1')
    return structuredClone(builtInBanks)
  }
}
export function saveBanks(banks: QuestionBank[]) {
  if (!trySetItem(BANKS_KEY, JSON.stringify(encodeStoredBanks(banks)))) return false
  const englishBanks = banks.filter(bank => bank.id.startsWith('english-'))
  const englishIsCurrent = englishBanks.length === 0 || englishBanks.every(bank => bank.chapters.every(chapter => chapter.sections.every(section => {
    const isPartB = section.questions.some(question => question.type === '阅读理解 Part B')
    return !isPartB || Boolean(section.partBKind)
  })))
  try {
    if (englishIsCurrent) localStorage.setItem(BUILTIN_SEED_KEY, '1')
    else localStorage.removeItem(BUILTIN_SEED_KEY)
  } catch { return false }
  return true
}
export function loadStatuses(): Record<string, QuestionStatus> {
  try {
    return validateStatuses(JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'))
  } catch { return {} }
}
export function saveStatuses(statuses: Record<string, QuestionStatus>) { return trySetItem(STATUS_KEY, JSON.stringify(statuses)) }
export function loadStudyActivities(): StudyActivity[] {
  try { return mergeStudyActivities(validateStudyActivities(JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]'))) } catch { return [] }
}
export function saveStudyActivities(activities: StudyActivity[]) { return trySetItem(ACTIVITY_KEY, JSON.stringify(activities)) }

export interface NavigationState {
  bankId: string
  sectionId: string
  questionId: string
  view: 'section' | 'wrong'
  page: 'study' | 'profile'
  profileBankId: string
  studyPositions: {
    math?: Pick<NavigationState, 'bankId' | 'sectionId' | 'questionId' | 'view'>
    english?: Pick<NavigationState, 'bankId' | 'sectionId' | 'questionId' | 'view'>
  }
}

function parseStudyPosition(value: unknown) {
  if (!isRecord(value) || typeof value.bankId !== 'string' || typeof value.sectionId !== 'string' || typeof value.questionId !== 'string') return undefined
  return { bankId: value.bankId, sectionId: value.sectionId, questionId: value.questionId, view: value.view === 'wrong' ? 'wrong' as const : 'section' as const }
}

export function loadNavigation(): NavigationState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(NAVIGATION_KEY) || 'null')
    if (!isRecord(value) || typeof value.bankId !== 'string' || typeof value.sectionId !== 'string' || typeof value.questionId !== 'string') return null
    return {
      bankId: value.bankId,
      sectionId: value.sectionId,
      questionId: value.questionId,
      view: value.view === 'wrong' ? 'wrong' : 'section',
      page: value.page === 'profile' ? 'profile' : 'study',
      profileBankId: typeof value.profileBankId === 'string' ? value.profileBankId : '',
      studyPositions: isRecord(value.studyPositions) ? {
        math: parseStudyPosition(value.studyPositions.math),
        english: parseStudyPosition(value.studyPositions.english),
      } : {},
    }
  } catch { return null }
}

export function saveNavigation(value: NavigationState) { return trySetItem(NAVIGATION_KEY, JSON.stringify(value)) }

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
              passage: optionalString(rawSection.passage, `${sectionPath}.passage`),
              passageImageUrls: optionalStringArray(rawSection.passageImageUrls, `${sectionPath}.passageImageUrls`),
              partBKind: VALID_PART_B_KINDS.has(rawSection.partBKind as PartBKind) ? rawSection.partBKind as PartBKind : undefined,
              partBSequence: optionalString(rawSection.partBSequence, `${sectionPath}.partBSequence`),
              questions: rawSection.questions.map((rawQuestion, questionIndex) => {
                const questionPath = `${sectionPath}.questions[${questionIndex}]`
                if (!isRecord(rawQuestion)) throw new Error(`${questionPath} 格式不正确`)
                if (!Number.isFinite(rawQuestion.number)) throw new Error(`${questionPath}.number 必须是数字`)
                if (rawQuestion.options !== undefined && (!Array.isArray(rawQuestion.options) || rawQuestion.options.some(option => typeof option !== 'string')))
                  throw new Error(`${questionPath}.options 必须是文本数组`)
                const type = optionalString(rawQuestion.type, `${questionPath}.type`)
                const imageUrl = optionalString(rawQuestion.imageUrl, `${questionPath}.imageUrl`)
                const imageKeys = optionalStringArray(rawQuestion.imageKeys, `${questionPath}.imageKeys`)
                const answerImageUrl = optionalString(rawQuestion.answerImageUrl, `${questionPath}.answerImageUrl`)
                const answerImageKeys = optionalStringArray(rawQuestion.answerImageKeys, `${questionPath}.answerImageKeys`)
                const text = typeof rawQuestion.text === 'string' && rawQuestion.text.trim() === '' && (type === '图片题' || imageUrl || imageKeys?.length || answerImageUrl || answerImageKeys?.length)
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
                  answerImageUrl,
                  imageKeys,
                  answerImageKeys,
                  videoUrl: optionalString(rawQuestion.videoUrl, `${questionPath}.videoUrl`),
                  readingType: VALID_READING_TYPES.has(rawQuestion.readingType as ReadingQuestionType) ? rawQuestion.readingType as ReadingQuestionType : undefined
                }
              })
            }
          })
        }
      })
    }
  })
}
