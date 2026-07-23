import type { QuestionBank } from './types'
import defaultManifestUrl from '../默认题库/题库数据.json?url'
import { removeRetiredBanks } from './bankMigration'

export let englishBanks: QuestionBank[] = []
export let builtInBanks: QuestionBank[] = []

export function initializeDefaultBanks(banks: QuestionBank[]) {
  const activeBanks = removeRetiredBanks(banks)
  englishBanks = activeBanks.filter(bank => bank.id.startsWith('english-'))
  builtInBanks = [...activeBanks]
}

export async function loadDefaultBanks() {
  if (builtInBanks.length) return builtInBanks
  const response = await fetch(defaultManifestUrl)
  if (!response.ok) throw new Error(`默认题库加载失败（${response.status}）`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { banks?: unknown }).banks))
    throw new Error('默认题库清单格式无效')
  initializeDefaultBanks((payload as { banks: QuestionBank[] }).banks)
  return builtInBanks
}

export const defaultBankIds = [
  'workspace-1783924545931-2',
  'default-1783931377861-22',
  'default-1783931377861-23',
  'default-math-1000a-calculus',
  'default-math-1000a-linear',
  'default-math-1000b-calculus',
  'default-math-1000b-linear',
  'default-kira-linear-basic',
  'workspace-1783942778439-28',
  'workspace-1783942778439-29',
  'default-880-calculus',
  'default-1784554026524-19',
  'english-exams',
  'default-mechanical-theory-lecture-exercises',
  'default-mechanical-theory-textbook-exercises',
  'default-mechanical-design-lecture-exercises',
  'default-mechanical-theory-basic-450',
  'default-mechanical-theory-intensive-220',
  'default-mechanical-design-basic-600',
  'default-mechanical-design-pass-680',
  'default-mechanical-design-intensive-notes',
] as const
