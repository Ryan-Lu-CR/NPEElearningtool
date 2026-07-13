const ABBREVIATION_DOT = '\uE000'

function protectAbbreviations(text: string) {
  return text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi, `$1${ABBREVIATION_DOT}`)
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, `$1${ABBREVIATION_DOT}`)
    .replace(/\b([A-Z])\.(?=\s+[A-Z]\.)/g, `$1${ABBREVIATION_DOT}`)
}

function splitSentences(text: string) {
  const protectedText = protectAbbreviations(text)
  const sentences: string[] = []
  let start = 0
  for (let index = 0; index < protectedText.length; index += 1) {
    if (!'.!?'.includes(protectedText[index])) continue
    let end = index + 1
    while (/["'\u2019\u201d)]/.test(protectedText[end] || '')) end += 1
    let next = end
    while (/\s/.test(protectedText[next] || '')) next += 1
    if (next < protectedText.length && !/[A-Z"'\u201c\u2018]/.test(protectedText[next])) continue
    const sentence = protectedText.slice(start, end).trim().replaceAll(ABBREVIATION_DOT, '.')
    if (sentence) sentences.push(sentence)
    start = next
    index = next - 1
  }
  const tail = protectedText.slice(start).trim().replaceAll(ABBREVIATION_DOT, '.')
  if (tail) sentences.push(tail)
  return sentences
}

export function formatPassageParagraphs(passage: string) {
  const suppliedParagraphs = passage.split(/\n\s*\n/).map(block => block.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (suppliedParagraphs.length > 1) return suppliedParagraphs
  const text = suppliedParagraphs[0] || passage.replace(/\s+/g, ' ').trim()
  const sentences = splitSentences(text)
  if (sentences.length < 4 || text.split(/\s+/).length < 150) return text ? [text] : []

  const paragraphs: string[] = []
  let current: string[] = []
  let wordCount = 0
  for (const sentence of sentences) {
    current.push(sentence)
    wordCount += sentence.split(/\s+/).length
    if (wordCount >= 78) {
      paragraphs.push(current.join(' '))
      current = []
      wordCount = 0
    }
  }
  if (current.length) {
    const tail = current.join(' ')
    if (paragraphs.length && wordCount < 38) paragraphs[paragraphs.length - 1] += ` ${tail}`
    else paragraphs.push(tail)
  }
  return paragraphs
}
