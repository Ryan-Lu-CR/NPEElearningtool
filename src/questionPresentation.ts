const IMAGE_ANSWER_PLACEHOLDERS = new Set(['见答案图片'])

export function isImageAnswerPlaceholder(value: string) {
  return IMAGE_ANSWER_PLACEHOLDERS.has(value.trim().replace(/[.。！!]+$/, ''))
}
