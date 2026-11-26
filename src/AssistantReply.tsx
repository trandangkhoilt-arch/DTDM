const vietnamTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

function formatReply(content: string) {
  return content
    .replace(/\s*\(\s*(?:(?:id|mã)\s*:\s*)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\s*\)/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})\b/g, (value) => {
      const timestamp = Date.parse(value)
      return Number.isFinite(timestamp) ? vietnamTime.format(timestamp) : value
    })
    .replace(/^([*-]?\s*\*{0,2}(?:Độ ưu tiên|Mức ưu tiên|Ưu tiên)\*{0,2}:\*{0,2}\s*\x60?)(HIGH|MEDIUM|LOW)\b/gim,
      (_, label: string, level: string) => label + ({ HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp' }[level.toUpperCase()] ?? level))
}

function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    return part
  })
}

type ReplyBlock = {
  type: 'paragraph' | 'heading' | 'ol' | 'ul'
  lines: string[]
  start?: number
}

export function AssistantReply({ content }: { content: string }) {
  const blocks: ReplyBlock[] = []
  let current: ReplyBlock | undefined
  for (const raw of formatReply(content).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      current = undefined
      continue
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', lines: [heading[1]] })
      current = undefined
      continue
    }
    const ordered = /^(\d{1,3})[.)]\s+(.+)$/.exec(line)
    const bullet = /^[-*•]\s+(.+)$/.exec(line)
    const type = ordered ? 'ol' : bullet ? 'ul' : 'paragraph'
    if (current?.type !== type) {
      current = { type, lines: [], start: ordered ? Number(ordered[1]) : undefined }
      blocks.push(current)
    }
    current.lines.push(ordered?.[2] ?? bullet?.[1] ?? line)
  }

  return <div className="assistant-reply">{blocks.map(({ type, lines, start }, index) => {
    if (type === 'heading') return <h3 key={index}>{inline(lines[0])}</h3>
    if (type === 'paragraph') return <p key={index}>{inline(lines.join('\n'))}</p>
    const entries = lines.map((line, lineIndex) => <li key={lineIndex}>{inline(line)}</li>)
    return type === 'ol' ? <ol key={index} start={start}>{entries}</ol> : <ul key={index}>{entries}</ul>
  })}</div>
}
