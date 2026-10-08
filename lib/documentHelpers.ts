/**
 * Utilities for formatting and synchronizing document issuance dates
 * across the Communications & Signable Docs feature.
 */

export function formatIssueDate(dateStr?: string | null): { longDate: string; isoDate: string } {
  if (!dateStr) {
    const now = new Date()
    const isoDate = now.toISOString().slice(0, 10)
    const longDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return { longDate, isoDate }
  }

  // Handle 'YYYY-MM-DD' or ISO strings safely without UTC timezone shift
  const cleanStr = String(dateStr).trim().slice(0, 10)
  const parts = cleanStr.split('-').map(Number)
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2])
    const longDate = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return { longDate, isoDate: cleanStr }
  }

  const dt = new Date(dateStr)
  if (!isNaN(dt.getTime())) {
    const isoDate = dt.toISOString().slice(0, 10)
    const longDate = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return { longDate, isoDate }
  }

  return { longDate: String(dateStr), isoDate: cleanStr }
}

/**
 * Ensures any memorandum header section (TO, COPIES TO, ISSUING ENTITY, CLIENT ACCOUNT, DATE, DOCUMENT CLASSIFICATION)
 * has its DATE / Date Issued dynamically populated with the actual issuance date instead of a static or hallucinated date.
 */
export function syncMemoHeaderDate(content: string, formattedDate: string): string {
  if (!content) return ''

  // 1. Target memo header date lines (e.g., DATE: March 30, 2026, **DATE:** March 30, 2026, Date: ...)
  let updated = content.replace(
    /(^|\n)(\s*(?:\*{0,2})(?:DATE|DATE ISSUED|ISSUE DATE|EFFECTIVE DATE):(?:\*{0,2})\s*)([^\r\n]+)/gi,
    (match, prefix, label, value) => {
      const trailingSpaces = value.match(/\s+$/)?.[0] || ''
      return `${prefix}${label}${formattedDate}${trailingSpaces}`
    }
  )

  // 2. Specific safety net for hallucinated "March 30, 2026" or "March 30 2026"
  updated = updated.replace(/March\s+30,?\s*2026/gi, formattedDate)

  return updated
}
