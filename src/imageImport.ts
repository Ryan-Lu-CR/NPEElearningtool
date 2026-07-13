import { parseImageFilename, parseStructuredImagePath, putAssets, type StructuredImageMatch } from './assets'
import type { QuestionBank } from './types'

export interface ImportImageEntry { file: File; relativePath: string; bankId: string }
export interface ImageImportResult { banks: QuestionBank[]; imported: number; matchedQuestions: number; createdQuestions: number; skipped: number; firstSectionId?: string }

export async function mergeImageEntries(initialBanks: QuestionBank[], entries: ImportImageEntry[]): Promise<ImageImportResult> {
  const updates = new Map<string, { question: Array<{ key: string; order: number }>; answer: Array<{ key: string; order: number }> }>()
  const structuredQuestions = new Map<string, { bankId: string; definition: StructuredImageMatch }>()
  const assets: Array<{ key: string; file: File }> = []
  let skipped = 0

  for (const entry of entries) {
    const targetBank = initialBanks.find(bank => bank.id === entry.bankId)
    if (!targetBank) { skipped++; continue }
    const questionIds = new Set(targetBank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions.map(question => question.id))))
    let match = parseImageFilename(entry.file.name, questionIds)
    if (!match) {
      const structured = parseStructuredImagePath(entry.relativePath, entry.file.name)
      if (structured) {
        const questionId = `${targetBank.id}-${structured.chapterCode}-${structured.sectionCode}-${structured.questionCode}`
        match = { questionId, kind: structured.kind, order: structured.order }
        structuredQuestions.set(questionId, { bankId: targetBank.id, definition: structured })
      }
    }
    if (!match) { skipped++; continue }
    const key = `${match.questionId}/${match.kind}/${match.order}-${entry.file.name}`
    const update = updates.get(match.questionId) || { question: [], answer: [] }
    update[match.kind].push({ key, order: match.order })
    updates.set(match.questionId, update)
    assets.push({ key, file: entry.file })
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
      let section = chapter.sections.find(entry => entry.id === sectionId)
      if (!section) { section = { id: sectionId, name: definition.sectionName, questions: [] }; chapter.sections.push(section) }
      const existing = section.questions.find(entry => entry.id === questionId)
      if (!existing) section.questions.push({ id: questionId, number: Number(definition.questionCode), text: '', answer: '见答案图片', analysis: '暂无文字解析' })
      section.questions.sort((a, b) => a.number - b.number)
    }
    clone.chapters.sort((a, b) => a.id.localeCompare(b.id, 'zh-CN', { numeric: true }))
    for (const chapter of clone.chapters) for (const section of chapter.sections) for (const question of section.questions) {
      const update = updates.get(question.id)
      if (!update) continue
      const questionKeys = update.question.sort((a, b) => a.order - b.order).map(entry => entry.key)
      const answerKeys = update.answer.sort((a, b) => a.order - b.order).map(entry => entry.key)
      question.imageKeys = [...new Set([...(question.imageKeys || []), ...questionKeys])]
      question.answerImageKeys = [...new Set([...(question.answerImageKeys || []), ...answerKeys])]
    }
    return clone
  })
  const first = structuredQuestions.values().next().value as { bankId: string; definition: StructuredImageMatch } | undefined
  return {
    banks,
    imported: assets.length,
    matchedQuestions: updates.size,
    createdQuestions: structuredQuestions.size,
    skipped,
    firstSectionId: first ? `${first.bankId}-chapter-${first.definition.chapterCode}-section-${first.definition.sectionCode}` : undefined
  }
}
