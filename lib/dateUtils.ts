/**
 * Date and Timestamp Utilities for Tabak Law Dashboard
 * Operational Timezone: America/Chicago (US Central Time)
 */

export const FIRM_TIMEZONE = 'America/Chicago'

/**
 * Returns the current date/time formatted as 'YYYY-MM-DD HH:mm:ss'
 * in the firm's operational timezone (America/Chicago / US Central).
 * This prevents UTC midnight rollover bugs where evening logs (after 7 PM CDT) get stamped as the next day.
 */
export function getBusinessTimestamp(date: Date = new Date(), timeZone: string = FIRM_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  parts.forEach((p) => { map[p.type] = p.value })

  const hour = map.hour === '24' ? '00' : (map.hour || '00')
  return `${map.year}-${map.month}-${map.day} ${hour}:${map.minute}:${map.second}`
}

/**
 * Returns the current date formatted as 'YYYY-MM-DD' in the firm's timezone.
 */
export function getBusinessDate(date: Date = new Date(), timeZone: string = FIRM_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

/**
 * Returns the current time formatted as 'HH:mm' in the firm's timezone (America/Chicago / US Central).
 */
export function getBusinessTime(date: Date = new Date(), timeZone: string = FIRM_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  parts.forEach((p) => { map[p.type] = p.value })
  const hour = map.hour === '24' ? '00' : (map.hour || '00')
  return `${hour}:${map.minute}`
}

/**
 * Calculates the difference in minutes between a scheduled target (YYYY-MM-DD and HH:mm in America/Chicago)
 * and the current time in America/Chicago.
 * Positive number = minutes in the future (e.g. 15 = due in 15 mins).
 * Negative number = minutes in the past (e.g. -20 = 20 mins overdue).
 * 0 = due right now.
 */
export function getCentralDiffMinutes(dateStr: string, timeStr: string): number {
  if (!dateStr || !timeStr) return 0
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const targetDate = new Date(year, month - 1, day, hour, minute, 0)

  // Current time in America/Chicago
  const nowCentral = new Date(new Date().toLocaleString('en-US', { timeZone: FIRM_TIMEZONE }))
  return Math.round((targetDate.getTime() - nowCentral.getTime()) / 60000)
}

