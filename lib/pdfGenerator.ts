import { jsPDF } from 'jspdf'
import { TABAK_LOGO_BASE64, ANDES_LOGO_BASE64 } from './logoAssets'

export interface DocumentData {
  id: number
  title: string
  category: string
  content: string
  issuing_entity?: string | null
  created_by_name: string
  created_by_role: string
  created_at: string
  deadline_date?: string | null
  target_type: string
  target_lob?: string | null
}

export interface AcknowledgementData {
  id?: number
  username: string
  user_display_name: string
  user_lob?: string | null
  status: 'PENDING' | 'SIGNED'
  signature_text?: string | null
  signed_at?: string | null
  ip_address?: string | null
  user_agent?: string | null
}

function computeHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')
}

export function generateSignedDocumentPdf(
  docData: DocumentData,
  ackData?: AcknowledgementData
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  const pageWidth = 612
  const pageHeight = 792
  const margin = 45
  const contentWidth = pageWidth - margin * 2 // 522 pt
  let currentY = 40

  const drawHeader = () => {
    // 1. Dual Logos
    try {
      doc.addImage(ANDES_LOGO_BASE64, 'WEBP', margin, currentY, 95, 28)
    } catch {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(14, 116, 144)
      doc.text('ANDES WORKFORCE', margin, currentY + 18)
    }

    try {
      doc.addImage(TABAK_LOGO_BASE64, 'PNG', pageWidth - margin - 130, currentY, 130, 28)
    } catch {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(15, 23, 42)
      doc.text('TABAK LAW, LLC', pageWidth - margin - 130, currentY + 18)
    }

    currentY += 36

    // Partnership banner
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 41, 59)
    doc.text('ANDES WORKFORCE, LLC', margin, currentY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 116, 139)
    doc.text('  |  Legal Intake & Case Management Operations on behalf of Tabak Law, LLC', margin + 115, currentY)

    currentY += 10
    // Separator line
    doc.setDrawColor(15, 41, 74)
    doc.setLineWidth(1.5)
    doc.line(margin, currentY, pageWidth - margin, currentY)
    currentY += 18
  }

  drawHeader()

  // 2. Metadata Box
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, currentY, contentWidth, 68, 4, 4, 'FD')

  // Category Tag
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(184, 33, 5)
  doc.text((docData.category || 'OFFICIAL OPERATIONAL DIRECTIVE').toUpperCase(), margin + 14, currentY + 18)

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  const titleLines = doc.splitTextToSize(docData.title, contentWidth - 28)
  doc.text(titleLines.slice(0, 2), margin + 14, currentY + 34)

  // Meta Row
  const roleLabel = docData.created_by_role === 'master' ? 'Director' : 'Team Leader'
  const targetLabel = docData.target_type === 'ALL'
    ? 'All Intake Personnel'
    : docData.target_lob
    ? `${docData.target_lob} Intake Team`
    : 'Selected Operational Personnel'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  const metaText = `Issued by: ${docData.created_by_name} (${roleLabel})   ·   Date: ${docData.created_at.slice(0, 10)}   ·   Target: ${targetLabel}${docData.deadline_date ? `   ·   Deadline: ${docData.deadline_date}` : ''}`
  doc.text(metaText, margin + 14, currentY + 54)

  currentY += 84

  // 3. Document Body
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(30, 41, 59)

  const paragraphs = docData.content.split('\n')

  for (let rawPara of paragraphs) {
    const trimmed = rawPara.trim()
    if (!trimmed) {
      currentY += 8
      continue
    }

    // Check page space
    if (currentY > pageHeight - 90) {
      doc.addPage()
      currentY = 45
      drawHeader()
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text(trimmed.replace('### ', ''), margin, currentY)
      currentY += 16
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(30, 41, 59)
      continue
    } else if (trimmed.startsWith('## ')) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text(trimmed.replace('## ', ''), margin, currentY)
      currentY += 18
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(30, 41, 59)
      continue
    } else if (trimmed.startsWith('# ')) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(184, 33, 5)
      doc.text(trimmed.replace('# ', ''), margin, currentY)
      currentY += 20
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(30, 41, 59)
      continue
    }

    // Bullet point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.substring(2)
      const bulletLines = doc.splitTextToSize(bulletText, contentWidth - 16)
      doc.text('•', margin + 4, currentY)
      doc.text(bulletLines, margin + 16, currentY)
      currentY += bulletLines.length * 13 + 4
      continue
    }

    // Standard paragraph
    const lines = doc.splitTextToSize(trimmed, contentWidth)
    if (currentY + lines.length * 13 > pageHeight - 80) {
      doc.addPage()
      currentY = 45
      drawHeader()
    }
    doc.text(lines, margin, currentY)
    currentY += lines.length * 13 + 6
  }

  // 4. Electronic Signature & Legal Acknowledgment Certificate
  const certHeight = 165
  if (currentY + certHeight > pageHeight - 60) {
    doc.addPage()
    currentY = 45
    drawHeader()
  } else {
    currentY += 15
  }

  const isSigned = ackData && ackData.status === 'SIGNED'

  // Certificate Box
  doc.setFillColor(isSigned ? 240 : 254, isSigned ? 253 : 242, isSigned ? 244 : 242)
  doc.setDrawColor(isSigned ? 187 : 252, isSigned ? 247 : 165, isSigned ? 208 : 165)
  doc.setLineWidth(1)
  doc.roundedRect(margin, currentY, contentWidth, certHeight, 5, 5, 'FD')

  // Certificate Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(isSigned ? 22 : 185, isSigned ? 101 : 28, isSigned ? 52 : 28)
  doc.text(
    isSigned
      ? '✓ OFFICIAL CERTIFICATE OF ELECTRONIC SIGNATURE & LEGAL ACKNOWLEDGMENT'
      : '⚠️ PENDING ELECTRONIC SIGNATURE & LEGAL ACKNOWLEDGMENT',
    margin + 16,
    currentY + 20
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text(
    'Recorded by Andes Workforce, LLC for Tabak Law, LLC Operations · Validated Electronic Record',
    margin + 16,
    currentY + 32
  )

  // Legal Declaration Clause
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  const legalText = `Contractor Declaration: "I, ${
    isSigned ? ackData.signature_text || ackData.user_display_name : '[Contractor Full Name]'
  }, an independent contractor of Andes Workforce, LLC assigned to provide intake and operational support for the Tabak Law, LLC account, hereby acknowledge that I have received, read, and understand this communication. I agree to comply with all operational guidelines, quality standards, and policies set forth herein. I understand that entering my full legal name constitutes my legally binding electronic signature."`
  const legalLines = doc.splitTextToSize(legalText, contentWidth - 32)
  doc.text(legalLines, margin + 16, currentY + 48)

  const certMetaY = currentY + 48 + legalLines.length * 10 + 10

  // Divider inside certificate
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.5)
  doc.line(margin + 16, certMetaY, margin + contentWidth - 16, certMetaY)

  // Details Grid
  const col1X = margin + 16
  const col2X = margin + 260
  const row1Y = certMetaY + 14
  const row2Y = certMetaY + 28
  const row3Y = certMetaY + 42

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('Independent Contractor:', col1X, row1Y)
  doc.text('Contractual Role:', col1X, row2Y)
  doc.text('Electronic Signature:', col1X, row3Y)

  doc.text('Verification Code:', col2X, row1Y)
  doc.text('Timestamp:', col2X, row2Y)
  doc.text('Audit Status:', col2X, row3Y)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)

  if (isSigned) {
    const signerName = ackData.signature_text || ackData.user_display_name
    const verCode = `AW-TL-${docData.id}-${ackData.id || 1}-${computeHash(`${docData.id}:${ackData.username}:${ackData.signed_at}`)}`
    doc.text(`${signerName} (${ackData.username})`, col1X + 96, row1Y)
    doc.text(`Contractor (${ackData.user_lob || 'Intake'} Specialist)`, col1X + 96, row2Y)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(4, 120, 87)
    doc.text(`[DIGITALLY SIGNED /s/ ${signerName}]`, col1X + 96, row3Y)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(verCode, col2X + 85, row1Y)
    doc.text(ackData.signed_at || new Date().toISOString(), col2X + 85, row2Y)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(4, 120, 87)
    doc.text('VERIFIED & TAMPER-EVIDENT', col2X + 85, row3Y)
  } else {
    doc.text('[Pending Specialist Action]', col1X + 96, row1Y)
    doc.text('Independent Contractor', col1X + 96, row2Y)
    doc.setTextColor(220, 38, 38)
    doc.text('[Awaiting Signature Submission]', col1X + 96, row3Y)

    doc.setTextColor(71, 85, 105)
    doc.text('PENDING-SIGNATURE', col2X + 85, row1Y)
    doc.text('Not yet executed', col2X + 85, row2Y)
    doc.setTextColor(220, 38, 38)
    doc.text('ACTION REQUIRED', col2X + 85, row3Y)
  }

  // 5. Page Footers (Page X of Y)
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(
      'Andes Workforce, LLC · Legal Intake & Operations for Tabak Law, LLC',
      margin,
      pageHeight - 25
    )
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 45, pageHeight - 25)
  }

  return doc
}

export function downloadSignedDocumentPdf(
  docData: DocumentData,
  ackData?: AcknowledgementData,
  customFilename?: string
) {
  try {
    const pdf = generateSignedDocumentPdf(docData, ackData)
    const cleanTitle = (docData.title || 'Document').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40)
    const signer = ackData?.signature_text ? `_${ackData.signature_text.replace(/[^a-zA-Z0-9_-]/g, '_')}` : ''
    const filename = customFilename || `Tabak_Andes_${cleanTitle}${signer}.pdf`
    pdf.save(filename)
  } catch (err: any) {
    console.error('[pdfGenerator] Failed to generate PDF:', err)
    alert(`Could not generate PDF: ${err.message}`)
  }
}
