import { parseStructuredImagePath, putAssets, type StructuredImageMatch } from './assets'
import type { QuestionBank } from './types'

export interface ImportImageEntry { file: File; relativePath: string; bankId: string; assetUrl?: string }
export interface ImageImportResult { banks: QuestionBank[]; imported: number; matchedQuestions: number; createdQuestions: number; skipped: number; firstSectionId?: string }
export interface MergeImageOptions { replaceExistingAssets?: boolean }

export function isGeneratedChapterName(name: string, chapterCode: string) {
  return new RegExp(`^第\\s*0*${Number(chapterCode)}\\s*章$`).test(name.trim())
}

export function isGeneratedSectionName(name: string, sectionCode: string) {
  return new RegExp(`^第\\s*0*${Number(sectionCode)}\\s*节$`).test(name.trim())
}

export async function mergeImageEntries(initialBanks: QuestionBank[], entries: ImportImageEntry[], options: MergeImageOptions = {}): Promise<ImageImportResult> {
  const updates = new Map<string, { question: Array<{ key: string; order: number }>; answer: Array<{ key: string; order: number }> }>()
  const structuredQuestions = new Map<string, { bankId: string; definition: StructuredImageMatch }>()
  const assets: Array<{ key: string; file: File; url?: string }> = []
  let skipped = 0
  let createdQuestions = 0

  for (const entry of entries) {
    const targetBank = initialBanks.find(bank => bank.id === entry.bankId)
    if (!targetBank) { skipped++; continue }
    const structured = parseStructuredImagePath(entry.relativePath, entry.file.name)
    if (!structured) { skipped++; continue }
    const questionId = `${targetBank.id}-${structured.chapterCode}-${structured.sectionCode}-${structured.questionCode}`
    structuredQuestions.set(questionId, { bankId: targetBank.id, definition: structured })
    const key = `${questionId}/${structured.kind}/${structured.order}-${entry.file.name}`
    const update = updates.get(questionId) || { question: [], answer: [] }
    update[structured.kind].push({ key, order: structured.order })
    updates.set(questionId, update)
    assets.push({ key, file: entry.file, url: entry.assetUrl })
  }
  if (!assets.length) return { banks: initialBanks, imported: 0, matchedQuestions: 0, createdQuestions: 0, skipped }
  await putAssets(assets)

  const banks = initialBanks.map(item => {
    const clone = structuredClone(item)
    for (const [questionId, record] of structuredQuestions) {
      if (record.bankId !== item.id) continue
      const definition = record.definition
      const chapterId = `${item.id}-chapter-${definition.chapterCode}`
      const sectionId = `${chapterId}-section-${definition.sectionCode}`
      let chapter = clone.chapters.find(entry => entry.id === chapterId)
      if (!chapter) { chapter = { id: chapterId, name: definition.chapterName, sections: [] }; clone.chapters.push(chapter) }
      else if (isGeneratedChapterName(chapter.name, definition.chapterCode) && !isGeneratedChapterName(definition.chapterName, definition.chapterCode)) chapter.name = definition.chapterName
      let section = chapter.sections.find(entry => entry.id === sectionId)
      if (!section) { section = { id: sectionId, name: definition.sectionName, questions: [] }; chapter.sections.push(section) }
      else if (isGeneratedSectionName(section.name, definition.sectionCode) && !isGeneratedSectionName(definition.sectionName, definition.sectionCode)) section.name = definition.sectionName
      const existing = section.questions.find(entry => entry.id === questionId)
      if (!existing) {
        section.questions.push({ id: questionId, number: Number(definition.questionCode), text: '', answer: '见答案图片', analysis: '暂无文字解析' })
        createdQuestions++
      }
      section.questions.sort((a, b) => a.number - b.number)
    }
    clone.chapters.sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true }))
    for (const chapter of clone.chapters) chapter.sections.sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true }))
    for (const chapter of clone.chapters) for (const section of chapter.sections) for (const question of section.questions) {
      const update = updates.get(question.id)
      if (!update) continue
      const questionKeys = update.question.sort((a, b) => a.order - b.order).map(entry => entry.key)
      const answerKeys = update.answer.sort((a, b) => a.order - b.order).map(entry => entry.key)
      question.imageKeys = options.replaceExistingAssets ? questionKeys : [...new Set([...(question.imageKeys || []), ...questionKeys])]
      question.answerImageKeys = options.replaceExistingAssets ? answerKeys : [...new Set([...(question.answerImageKeys || []), ...answerKeys])]
    }
    return clone
  })
  const first = structuredQuestions.values().next().value as { bankId: string; definition: StructuredImageMatch } | undefined
  return {
    banks,
    imported: assets.length,
    matchedQuestions: updates.size,
    createdQuestions,
    skipped,
    firstSectionId: first ? `${first.bankId}-chapter-${first.definition.chapterCode}-section-${first.definition.sectionCode}` : undefined
  }
}
