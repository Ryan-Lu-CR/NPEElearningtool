import type { QuestionBank } from './types'
import defaultManifestUrl from '../默认题库/题库数据.json?url'

export let englishBanks: QuestionBank[] = []
export let builtInBanks: QuestionBank[] = []

export function initializeDefaultBanks(banks: QuestionBank[]) {
  englishBanks = banks.filter(bank => bank.id.startsWith('english-'))
  builtInBanks = [...banks]
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
  'default-1783931377861-24',
  'default-1783931377861-25',
  'default-1783931377861-26',
  'default-kira-linear-basic',
  'workspace-1783942778439-28',
  'workspace-1783942778439-29',
  'default-880-calculus',
  'english-exams',
] as const
