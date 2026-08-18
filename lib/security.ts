import crypto from 'crypto'
import getDb from '@/lib/db'

export interface FileValidationOptions {
  maxSizeBytes?: number // default 15MB
  allowedTypes?: ('xlsx' | 'xls' | 'pdf' | 'csv')[]
}

export interface ValidationResult {
  isValid: boolean
  error?: string
  detectedType?: string
}

/**
 * Validates file buffer size and authenticates file type via binary Magic Bytes.
 */
export function validateFileUpload(
  buffer: Buffer,
  filename: string,
  options: FileValidationOptions = {}
): ValidationResult {
  const maxBytes = options.maxSizeBytes || 15 * 1024 * 1024 // 15MB default

  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: 'File is empty' }
  }

  if (buffer.length > maxBytes) {
    return {
      isValid: false,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
    }
  }

  // Magic Bytes Check
  // ZIP / XLSX: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
  const isZipXlsx =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)

  // Legacy XLS (Compound File Binary Format): 0xD0, 0xCF, 0x11, 0xE0
  const isLegacyXls =
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0

  // PDF: %PDF (0x25, 0x50, 0x44, 0x46)
  const isPdf =
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46

  let detected = 'unknown'
  if (isZipXlsx) detected = 'xlsx'
  else if (isLegacyXls) detected = 'xls'
  else if (isPdf) detected = 'pdf'
  else if (filename.toLowerCase().endsWith('.csv')) detected = 'csv'

  const allowed = options.allowedTypes || ['xlsx', 'xls']
  if (!allowed.includes(detected as any)) {
    return {
      isValid: false,
      error: `Invalid file signature. File header did not match expected ${allowed.join(', ').toUpperCase()} binary format.`,
      detectedType: detected,
    }
  }

  return { isValid: true, detectedType: detected }
}

/**
 * Sanitizes cell text to prevent CSV/Excel Formula Injection and Stored XSS.
 * Neutralizes leading formula triggers (=, +, -, @, |, \t, \r) and removes dangerous script tags.
 */
export function sanitizeCellText(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') return String(val)
  if (typeof val !== 'string') return String(val).trim()

  let text = val.trim()

  // Remove HTML / Script tags
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<[^>]+>/g, '')

  // Prevent CSV / Excel Formula Injection:
  // If the cell begins with =, +, -, @, |, or tab, prepend a single quote to force spreadsheet programs to render as plain text.
  if (/^[=+\-@|\t\r]/.test(text)) {
    text = "'" + text
  }

  return text
}

/**
 * Automatically masks accidental PII (phone numbers and SSN patterns) in free-hand notes as defense-in-depth.
 */
export function maskSensitivePII(text: string): string {
  if (!text) return ''
  let sanitized = sanitizeCellText(text)

  // Mask 10/11-digit phone numbers: e.g. +1-555-123-4567 or (555) 123-4567 or 555-123-4567
  sanitized = sanitized.replace(
    /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)(\d{3})[-.\s]?(\d{4})/g,
    '***-***-$4'
  )

  // Mask 9-digit SSN patterns: 123-45-6789
  sanitized = sanitized.replace(
    /\b\d{3}[-\s]?\d{2}[-\s]?(\d{4})\b/g,
    '***-**-$1'
  )

  return sanitized
}

/**
 * Computes SHA-256 hash of the uploaded file buffer.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Logs an immutable entry in upload_audit_logs.
 */
export function recordUploadAudit({
  userId,
  username,
  userName,
  uploadType,
  filename,
  buffer,
  rowsProcessed,
  status = 'SUCCESS',
  details,
  ipAddress,
}: {
  userId?: number
  username: string
  userName?: string
  uploadType: 'call_report' | 'eod_report' | 'va_leads' | 'ssd_leads' | 'ssd_converted' | 'qa_scores' | 'apps_team' | 'pip_doc'
  filename: string
  buffer: Buffer
  rowsProcessed: number
  status?: 'SUCCESS' | 'FAILED' | 'REJECTED'
  details?: string
  ipAddress?: string
}) {
  try {
    const db = getDb()
    const fileHash = computeFileHash(buffer)
    const fileSize = buffer.length

    db.prepare(`
      INSERT INTO upload_audit_logs (
        user_id, username, user_name, upload_type, filename,
        file_size_bytes, file_hash_sha256, rows_processed, status,
        details, ip_address, created_at
      ) VALUES (
        @userId, @username, @userName, @uploadType, @filename,
        @fileSize, @fileHash, @rowsProcessed, @status,
        @details, @ipAddress, datetime('now')
      )
    `).run({
      userId: userId || null,
      username: username || 'unknown',
      userName: userName || username || 'Unknown User',
      uploadType,
      filename,
      fileSize,
      fileHash,
      rowsProcessed,
      status,
      details: details || null,
      ipAddress: ipAddress || null,
    })
  } catch (err: any) {
    console.error('[security] Failed to record upload audit log:', err.message)
  }
}
