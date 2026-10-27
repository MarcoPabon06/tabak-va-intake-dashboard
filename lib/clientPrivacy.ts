import * as XLSX from 'xlsx'

/**
 * Pure client-side name masking ("John Smith" -> "J*** S***").
 * Ensures that even the outgoing HTTP request payload from the browser
 * never transmits full client or veteran names over the network.
 */
export function maskNameClientSide(rawName: any, leadId?: any): string {
  const cleanLeadId =
    leadId !== null && leadId !== undefined && String(leadId).trim() !== '' && String(leadId).trim() !== '—'
      ? String(leadId).trim()
      : ''

  if (rawName === null || rawName === undefined) {
    return cleanLeadId ? `Lead #${cleanLeadId}` : 'C***'
  }

  const sanitized = String(rawName).replace(/^'+/, '').trim()
  if (!sanitized || /^unknown(\s+client)?$/i.test(sanitized) || /^unnamed(\s+client)?$/i.test(sanitized)) {
    return cleanLeadId ? `Lead #${cleanLeadId}` : 'C***'
  }

  if (/^lead\s*#/i.test(sanitized)) {
    return sanitized
  }

  if (/^[A-Za-zÀ-ÿ0-9]\*{3}(\s+[A-Za-zÀ-ÿ0-9]\*{3})*$/.test(sanitized)) {
    return sanitized
      .split(/\s+/)
      .map((t) => `${t.charAt(0).toUpperCase()}***`)
      .join(' ')
  }

  const tokens = sanitized
    .replace(/[,.;:()[\]/\\_-]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-zÀ-ÿ0-9*]/g, ''))
    .filter(Boolean)

  if (tokens.length === 0) {
    return cleanLeadId ? `Lead #${cleanLeadId}` : 'C***'
  }

  return tokens
    .slice(0, 4)
    .map((token) => `${token.charAt(0).toUpperCase()}***`)
    .join(' ')
}

/**
 * Pre-scrubs an Excel file in the browser BEFORE it is sent in an HTTP request,
 * masking any client/veteran name columns ("First Name", "Last Name", "Veteran Name",
 * "Client Name", "Lead's Name") into "J*** S***" format locally on the user's device.
 */
export async function scrubExcelFileClientSide(file: File): Promise<File> {
  try {
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      return file
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    // Only pre-scrub valid binary XLSX (PK) or XLS (D0 CF) files
    const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    const isXls = bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf
    if (!isZip && !isXls) {
      return file
    }

    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
    const nameHeaderPatterns = [
      'veteran name',
      "veteran's name",
      'veteran',
      'client name',
      "client's name",
      'client',
      "lead's name",
      'lead name',
      'first name',
      'firstname',
      'last name',
      'lastname',
      'claimant',
      'cliente',
    ]
    const phoneHeaderPatterns = ['phone', 'telefono', 'teléfono', 'mobile', 'cell', 'ssn', 'social security']

    let modified = false

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      if (!ws) continue
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (!rows || rows.length === 0) continue

      // Locate header row within the first 15 rows
      for (let rIdx = 0; rIdx < Math.min(rows.length, 15); rIdx++) {
        const row = rows[rIdx]
        if (!Array.isArray(row)) continue

        const nameCols: number[] = []
        const phoneCols: number[] = []

        row.forEach((cell: any, cIdx: number) => {
          const h = String(cell || '').trim().toLowerCase()
          if (!h) return
          // Do not mask Intake Rep / Agent / Assignee columns
          if (h.includes('rep') || h.includes('agent') || h.includes('assignee') || h.includes('specialist') || h.includes('advisor')) {
            return
          }
          if (nameHeaderPatterns.some((p) => h === p || h.includes(p))) {
            nameCols.push(cIdx)
          } else if (phoneHeaderPatterns.some((p) => h === p || h.includes(p))) {
            phoneCols.push(cIdx)
          }
        })

        if (nameCols.length > 0 || phoneCols.length > 0) {
          for (let dataIdx = rIdx + 1; dataIdx < rows.length; dataIdx++) {
            const dataRow = rows[dataIdx]
            if (!Array.isArray(dataRow)) continue

            for (const c of nameCols) {
              if (dataRow[c] !== undefined && dataRow[c] !== null && String(dataRow[c]).trim() !== '') {
                dataRow[c] = maskNameClientSide(dataRow[c])
                modified = true
              }
            }
            for (const c of phoneCols) {
              if (dataRow[c] !== undefined && dataRow[c] !== null && String(dataRow[c]).trim() !== '') {
                dataRow[c] = '***-***-REDACTED'
                modified = true
              }
            }
          }
          break
        }
      }

      if (modified) {
        wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(rows)
      }
    }

    if (!modified) {
      return file
    }

    const outBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const cleanFilename = file.name.replace(/\.xls$/i, '.xlsx')
    return new File([outBuffer], cleanFilename, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  } catch {
    return file
  }
}
