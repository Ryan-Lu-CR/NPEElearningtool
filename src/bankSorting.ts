import type { QuestionBank } from './types'

const bankNameCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

export function sortBanksForDisplay(banks: QuestionBank[]) {
  return [...banks].sort((left, right) =>
    bankNameCollator.compare(left.name, right.name)
    || bankNameCollator.compare(left.id, right.id)
  )
}
