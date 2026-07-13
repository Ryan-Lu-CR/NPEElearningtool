import type { QuestionBank } from './types'
import englishBankUrl from './englishBanks.json?url'

export let englishBanks: QuestionBank[] = []
export let builtInBanks: QuestionBank[] = []

export function initializeBuiltInBanks(banks: QuestionBank[]) {
  englishBanks = banks
  builtInBanks = [...banks]
}

export async function loadBuiltInBanks() {
  if (builtInBanks.length) return builtInBanks
  const response = await fetch(englishBankUrl)
  if (!response.ok) throw new Error(`内置英语题库加载失败（${response.status}）`)
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { banks?: unknown }).banks))
    throw new Error('内置英语题库格式无效')
  initializeBuiltInBanks((payload as { banks: QuestionBank[] }).banks)
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
  'english-2004',
  'english-2005',
  'english-2006',
  'english-2007',
  'english-2008',
  'english-2009',
  'english-2010',
  'english-2011',
  'english-2012',
  'english-2013',
  'english-2014',
  'english-2015',
  'english-2016',
  'english-2017',
  'english-2018',
  'english-2019',
  'english-2020',
  'english-2021',
  'english-2022',
  'english-2023',
  'english-2024',
] as const
