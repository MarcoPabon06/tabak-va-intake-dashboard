import React from 'react'

interface Props {
  content: string
  className?: string
  style?: React.CSSProperties
  isDark?: boolean
}

/**
 * Parses inline markdown: **bold**, *italic*, __bold__, _italic_, `code`
 */
function renderInline(text: string, isDark: boolean = false): React.ReactNode {
  // Regex to match **bold**, *italic*, __bold__, _italic_, `code`
  const regex = /(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+(?<!\*)\*|(?<!_)_[^_]+(?<!_)_|`[^`]+`)/g
  const parts = text.split(regex)

  return parts.map((part, index) => {
    if (!part) return null

    // Bold **...** or __...__
    if ((part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)) {
      return (
        <strong key={index} style={{ fontWeight: 800, color: isDark ? '#ffffff' : '#0f172a' }}>
          {part.slice(2, -2)}
        </strong>
      )
    }

    // Italic *...* or _..._
    if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
      return (
        <em key={index} style={{ fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>
      )
    }

    // Inline Code `...`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          style={{
            background: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
            color: isDark ? '#fca5a5' : '#b82105',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: '0.9em',
            fontFamily: 'monospace',
          }}
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}

export default function FormattedMarkdown({ content, className, style, isDark = false }: Props) {
  if (!content) return null

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  let currentBulletList: string[] = []
  let currentNumberedList: string[] = []
  let currentQuote: string[] = []

  const flushBulletList = (key: string) => {
    if (currentBulletList.length > 0) {
      elements.push(
        <ul
          key={key}
          style={{
            margin: '8px 0 14px 20px',
            paddingLeft: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            listStyleType: 'disc',
            color: isDark ? '#cbd5e1' : '#334155',
          }}
        >
          {currentBulletList.map((item, idx) => (
            <li key={idx} style={{ lineHeight: 1.55 }}>
              {renderInline(item, isDark)}
            </li>
          ))}
        </ul>
      )
      currentBulletList = []
    }
  }

  const flushNumberedList = (key: string) => {
    if (currentNumberedList.length > 0) {
      elements.push(
        <ol
          key={key}
          style={{
            margin: '8px 0 14px 20px',
            paddingLeft: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            listStyleType: 'decimal',
            color: isDark ? '#cbd5e1' : '#334155',
          }}
        >
          {currentNumberedList.map((item, idx) => (
            <li key={idx} style={{ lineHeight: 1.55 }}>
              {renderInline(item, isDark)}
            </li>
          ))}
        </ol>
      )
      currentNumberedList = []
    }
  }

  const flushQuote = (key: string) => {
    if (currentQuote.length > 0) {
      elements.push(
        <div
          key={key}
          style={{
            background: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(15,41,74,0.04)',
            borderLeft: `4px solid ${isDark ? '#60a5fa' : '#0f294a'}`,
            padding: '10px 16px',
            borderRadius: 4,
            margin: '12px 0 16px 0',
            fontSize: '13px',
            color: isDark ? '#93c5fd' : '#1e293b',
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          {currentQuote.map((line, idx) => (
            <div key={idx}>{renderInline(line, isDark)}</div>
          ))}
        </div>
      )
      currentQuote = []
    }
  }

  const flushAll = (key: string) => {
    flushBulletList(`${key}-bl`)
    flushNumberedList(`${key}-nl`)
    flushQuote(`${key}-q`)
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Empty line
    if (!trimmed) {
      flushAll(`flush-empty-${i}`)
      continue
    }

    // Horizontal Rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushAll(`flush-hr-${i}`)
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'}`,
            margin: '20px 0',
          }}
        />
      )
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushBulletList(`flush-bl-${i}`)
      flushNumberedList(`flush-nl-${i}`)
      currentQuote.push(trimmed.substring(2))
      continue
    } else {
      flushQuote(`flush-q-${i}`)
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      flushAll(`flush-h3-${i}`)
      elements.push(
        <h3
          key={`h3-${i}`}
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: isDark ? '#f1f5f9' : '#0f172a',
            margin: '20px 0 8px 0',
            letterSpacing: '-0.01em',
          }}
        >
          {renderInline(trimmed.replace('### ', ''), isDark)}
        </h3>
      )
      continue
    }

    if (trimmed.startsWith('## ')) {
      flushAll(`flush-h2-${i}`)
      elements.push(
        <h2
          key={`h2-${i}`}
          style={{
            fontSize: 16.5,
            fontWeight: 800,
            color: isDark ? '#ffffff' : '#0f294a',
            margin: '24px 0 10px 0',
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9'}`,
            paddingBottom: 4,
            letterSpacing: '-0.01em',
          }}
        >
          {renderInline(trimmed.replace('## ', ''), isDark)}
        </h2>
      )
      continue
    }

    if (trimmed.startsWith('# ')) {
      flushAll(`flush-h1-${i}`)
      elements.push(
        <h1
          key={`h1-${i}`}
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: '#b82105',
            margin: '26px 0 12px 0',
            letterSpacing: '-0.02em',
          }}
        >
          {renderInline(trimmed.replace('# ', ''), isDark)}
        </h1>
      )
      continue
    }

    // Bullet List (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushNumberedList(`flush-nl-${i}`)
      currentBulletList.push(trimmed.substring(2))
      continue
    } else {
      flushBulletList(`flush-bl-${i}`)
    }

    // Numbered List (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (numMatch) {
      currentNumberedList.push(numMatch[2])
      continue
    } else {
      flushNumberedList(`flush-nl-${i}`)
    }

    // Standard Paragraph
    elements.push(
      <p
        key={`p-${i}`}
        style={{
          margin: '0 0 10px 0',
          lineHeight: 1.6,
          color: isDark ? '#cbd5e1' : '#334155',
          fontSize: 13.5,
        }}
      >
        {renderInline(rawLine, isDark)}
      </p>
    )
  }

  flushAll('flush-final')

  return (
    <div className={className} style={style}>
      {elements}
    </div>
  )
}
