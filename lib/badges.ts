// Badge definitions and computation engine
// All badges are computed from raw performance data — no extra database tables needed

export interface Badge {
  id: string
  name: string
  icon: string
  description: string
  category: 'milestone' | 'streak' | 'conversion' | 'mvp'
  earned: boolean
  earnedDate?: string    // first date the badge was earned
  progress?: number      // 0-100 for unearned badges
  progressLabel?: string // e.g. "18/25"
}

interface Row {
  date: string
  agent_name: string
  signed_retainers: number
  unsigned_retainers: number
  total_case_wanted: number
  present: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWorkdaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) {
      days.push(d.toISOString().slice(0, 10))
    }
    d.setDate(d.getDate() + 1)
  }
  return days
}

function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

// ─── Main computation ───────────────────────────────────────────────────────

export function computeBadges(allData: Row[], agentName: string): Badge[] {
  const myData = allData.filter((r) => r.agent_name === agentName)
  const badges: Badge[] = []

  // ── Aggregated values ──
  const totalSigned = myData.reduce((s, r) => s + (r.signed_retainers || 0), 0)

  // Days with at least 1 signed retainer
  const signedByDate: Record<string, number> = {}
  for (const r of myData) {
    signedByDate[r.date] = (signedByDate[r.date] || 0) + (r.signed_retainers || 0)
  }
  const datesWithSigned = Object.entries(signedByDate)
    .filter(([, v]) => v > 0)
    .map(([d]) => d)
    .sort()

  const maxSignedInDay = Math.max(0, ...Object.values(signedByDate))

  // ════════════════════════════════════════════════════════════════════════
  // SIGNING MILESTONES
  // ════════════════════════════════════════════════════════════════════════

  const milestones = [
    { id: 'first-blood',      name: 'First Blood',      icon: '🩸', target: 1,   desc: 'Sign your first retainer' },
    { id: 'double-digits',    name: 'Double Digits',     icon: '🔟', target: 10,  desc: 'Reach 10 total signed retainers' },
    { id: 'quarter-century',  name: 'Quarter Century',   icon: '🥈', target: 25,  desc: 'Reach 25 total signed retainers' },
    { id: 'half-century',     name: 'Half Century',      icon: '🥇', target: 50,  desc: 'Reach 50 total signed retainers' },
    { id: 'century-club',     name: 'Century Club',      icon: '💯', target: 100, desc: 'Reach 100 total signed retainers' },
    { id: '200-club',         name: '200 Club',          icon: '🏅', target: 200, desc: 'Reach 200 total signed retainers' },
  ]

  for (const m of milestones) {
    const earned = totalSigned >= m.target
    // Find the date when cumulative total first reached the target
    let earnedDate: string | undefined
    if (earned) {
      let cumulative = 0
      const sorted = [...myData].sort((a, b) => a.date.localeCompare(b.date))
      for (const r of sorted) {
        cumulative += r.signed_retainers || 0
        if (cumulative >= m.target) { earnedDate = r.date; break }
      }
    }
    badges.push({
      id: m.id,
      name: m.name,
      icon: m.icon,
      description: m.desc,
      category: 'milestone',
      earned,
      earnedDate,
      progress: Math.min(Math.round((totalSigned / m.target) * 100), 100),
      progressLabel: `${totalSigned}/${m.target}`,
    })
  }

  // Perfect Day: 3+ signed in a single day
  const perfectDayDate = Object.entries(signedByDate)
    .filter(([, v]) => v >= 3)
    .sort(([a], [b]) => a.localeCompare(b))[0]
  badges.push({
    id: 'perfect-day',
    name: 'Perfect Day',
    icon: '⭐',
    description: '3+ signed retainers in a single day',
    category: 'milestone',
    earned: !!perfectDayDate,
    earnedDate: perfectDayDate?.[0],
    progress: Math.min(Math.round((maxSignedInDay / 3) * 100), 100),
    progressLabel: `Best: ${maxSignedInDay}/3`,
  })

  // ════════════════════════════════════════════════════════════════════════
  // STREAK & CONSISTENCY
  // ════════════════════════════════════════════════════════════════════════

  // Compute best streak (consecutive workdays with ≥1 signed)
  let bestStreak = 0
  let currentStreak = 0
  let streakFirstDate = ''
  let bestStreakDate = ''

  // Get all workdays from data range
  if (datesWithSigned.length > 0) {
    const allDates = [...new Set(myData.map((r) => r.date))].sort()
    const startDate = new Date(allDates[0])
    const endDate = new Date(allDates[allDates.length - 1])
    const dateSet = new Set(datesWithSigned)

    const d = new Date(startDate)
    while (d <= endDate) {
      const dow = d.getUTCDay()
      if (dow >= 1 && dow <= 5) { // weekday
        const ds = d.toISOString().slice(0, 10)
        if (dateSet.has(ds)) {
          currentStreak++
          if (currentStreak === 1) streakFirstDate = ds
          if (currentStreak > bestStreak) {
            bestStreak = currentStreak
            bestStreakDate = streakFirstDate
          }
        } else {
          currentStreak = 0
        }
      }
      d.setDate(d.getDate() + 1)
    }
  }

  const streakBadges = [
    { id: 'on-fire',      name: 'On Fire',      icon: '🔥', target: 5,  desc: '5-day signing streak (consecutive workdays)' },
    { id: 'unstoppable',  name: 'Unstoppable',   icon: '💥', target: 10, desc: '10-day signing streak' },
    { id: 'iron-will',    name: 'Iron Will',     icon: '⚔️', target: 20, desc: '20-day signing streak' },
  ]

  for (const s of streakBadges) {
    badges.push({
      id: s.id,
      name: s.name,
      icon: s.icon,
      description: s.desc,
      category: 'streak',
      earned: bestStreak >= s.target,
      earnedDate: bestStreak >= s.target ? bestStreakDate : undefined,
      progress: Math.min(Math.round((bestStreak / s.target) * 100), 100),
      progressLabel: `Best: ${bestStreak}/${s.target} days`,
    })
  }

  // Perfect Week: signed every Mon–Fri in any week
  const weekBuckets: Record<string, Set<string>> = {}
  for (const ds of datesWithSigned) {
    const monday = getWeekMonday(ds)
    if (!weekBuckets[monday]) weekBuckets[monday] = new Set()
    const dow = new Date(ds).getUTCDay()
    if (dow >= 1 && dow <= 5) weekBuckets[monday].add(ds)
  }
  const perfectWeeks = Object.entries(weekBuckets).filter(([, days]) => days.size >= 5)
  const bestWeekDays = Math.max(0, ...Object.values(weekBuckets).map((s) => s.size))

  badges.push({
    id: 'perfect-week',
    name: 'Perfect Week',
    icon: '📅',
    description: 'Sign retainers every workday Mon–Fri',
    category: 'streak',
    earned: perfectWeeks.length > 0,
    earnedDate: perfectWeeks.sort(([a], [b]) => a.localeCompare(b))[0]?.[0],
    progress: Math.min(Math.round((bestWeekDays / 5) * 100), 100),
    progressLabel: `Best: ${bestWeekDays}/5 days`,
  })

  // Full Month: signed every workday of a calendar month
  const monthBuckets: Record<string, Set<string>> = {}
  for (const ds of datesWithSigned) {
    const ym = ds.slice(0, 7) // YYYY-MM
    if (!monthBuckets[ym]) monthBuckets[ym] = new Set()
    monthBuckets[ym].add(ds)
  }
  let fullMonthEarned = false
  let fullMonthDate = ''
  let bestMonthPct = 0
  for (const [ym, days] of Object.entries(monthBuckets)) {
    const [y, m] = ym.split('-').map(Number)
    const workdays = getWorkdaysInMonth(y, m - 1)
    const pct = Math.round((days.size / workdays.length) * 100)
    if (pct > bestMonthPct) bestMonthPct = pct
    if (days.size >= workdays.length && !fullMonthEarned) {
      fullMonthEarned = true
      fullMonthDate = ym + '-01'
    }
  }

  badges.push({
    id: 'full-month',
    name: 'Full Month',
    icon: '🗓️',
    description: 'Sign retainers every workday of an entire month',
    category: 'streak',
    earned: fullMonthEarned,
    earnedDate: fullMonthDate || undefined,
    progress: bestMonthPct,
    progressLabel: `Best: ${bestMonthPct}%`,
  })

  // ════════════════════════════════════════════════════════════════════════
  // CONVERSION RATE
  // ════════════════════════════════════════════════════════════════════════

  // Perfect Conversion: 100% in a day with 2+ cases
  const dailyConv: { date: string; signed: number; total: number }[] = []
  const byDateAll: Record<string, { signed: number; total: number }> = {}
  for (const r of myData) {
    if (!byDateAll[r.date]) byDateAll[r.date] = { signed: 0, total: 0 }
    byDateAll[r.date].signed += r.signed_retainers || 0
    byDateAll[r.date].total += (r.signed_retainers || 0) + (r.unsigned_retainers || 0)
  }
  for (const [date, v] of Object.entries(byDateAll)) {
    dailyConv.push({ date, ...v })
  }
  const perfectConvDay = dailyConv
    .filter((d) => d.total >= 2 && d.signed === d.total)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  badges.push({
    id: 'perfect-conversion',
    name: 'Perfect Conversion',
    icon: '💎',
    description: '100% conversion rate in a day (min 2 cases)',
    category: 'conversion',
    earned: !!perfectConvDay,
    earnedDate: perfectConvDay?.date,
  })

  // Sharpshooter: 80%+ conversion in a week (min 20 cases)
  const weeklyConv: Record<string, { signed: number; total: number }> = {}
  for (const d of dailyConv) {
    const monday = getWeekMonday(d.date)
    if (!weeklyConv[monday]) weeklyConv[monday] = { signed: 0, total: 0 }
    weeklyConv[monday].signed += d.signed
    weeklyConv[monday].total += d.total
  }
  const sharpWeek = Object.entries(weeklyConv)
    .filter(([, v]) => v.total >= 20 && (v.signed / v.total) >= 0.8)
    .sort(([a], [b]) => a.localeCompare(b))[0]

  badges.push({
    id: 'sharpshooter',
    name: 'Sharpshooter',
    icon: '🎯',
    description: '80%+ conversion rate in a week (min 20 cases)',
    category: 'conversion',
    earned: !!sharpWeek,
    earnedDate: sharpWeek?.[0],
  })

  // Closer: 90%+ conversion in a month (min 30 cases)
  const monthlyConv: Record<string, { signed: number; total: number }> = {}
  for (const d of dailyConv) {
    const ym = d.date.slice(0, 7)
    if (!monthlyConv[ym]) monthlyConv[ym] = { signed: 0, total: 0 }
    monthlyConv[ym].signed += d.signed
    monthlyConv[ym].total += d.total
  }
  const closerMonth = Object.entries(monthlyConv)
    .filter(([, v]) => v.total >= 30 && (v.signed / v.total) >= 0.9)
    .sort(([a], [b]) => a.localeCompare(b))[0]

  badges.push({
    id: 'closer',
    name: 'Closer',
    icon: '🤝',
    description: '90%+ conversion rate in a month (min 30 cases)',
    category: 'conversion',
    earned: !!closerMonth,
    earnedDate: closerMonth ? closerMonth[0] + '-01' : undefined,
  })

  // ════════════════════════════════════════════════════════════════════════
  // MONTHLY MVP
  // ════════════════════════════════════════════════════════════════════════

  // Find MVP for each calendar month across ALL agents
  const monthAgentTotals: Record<string, Record<string, number>> = {}
  for (const r of allData) {
    const ym = r.date.slice(0, 7)
    if (!monthAgentTotals[ym]) monthAgentTotals[ym] = {}
    monthAgentTotals[ym][r.agent_name] = (monthAgentTotals[ym][r.agent_name] || 0) + (r.signed_retainers || 0)
  }

  const mvpMonths: string[] = [] // months where this agent was MVP
  for (const [ym, agents] of Object.entries(monthAgentTotals)) {
    const sorted = Object.entries(agents).sort((a, b) => b[1] - a[1])
    if (sorted[0] && sorted[0][0] === agentName && sorted[0][1] > 0) {
      mvpMonths.push(ym)
    }
  }
  mvpMonths.sort()

  // Count consecutive MVP months
  let mvpStreak = 0
  let bestMvpStreak = 0
  for (let i = 0; i < mvpMonths.length; i++) {
    if (i === 0) { mvpStreak = 1 }
    else {
      const [py, pm] = mvpMonths[i - 1].split('-').map(Number)
      const [cy, cm] = mvpMonths[i].split('-').map(Number)
      const expectedMonth = pm === 12 ? 1 : pm + 1
      const expectedYear = pm === 12 ? py + 1 : py
      if (cy === expectedYear && cm === expectedMonth) { mvpStreak++ }
      else { mvpStreak = 1 }
    }
    bestMvpStreak = Math.max(bestMvpStreak, mvpStreak)
  }

  badges.push({
    id: 'monthly-mvp',
    name: 'Monthly MVP',
    icon: '🏆',
    description: 'Most signed retainers in a calendar month',
    category: 'mvp',
    earned: mvpMonths.length > 0,
    earnedDate: mvpMonths[0] ? mvpMonths[0] + '-01' : undefined,
    progressLabel: mvpMonths.length > 0 ? `${mvpMonths.length}× MVP` : 'Not yet',
  })

  badges.push({
    id: 'mvp-streak',
    name: 'MVP Streak',
    icon: '👑',
    description: 'Win MVP two months in a row',
    category: 'mvp',
    earned: bestMvpStreak >= 2,
    earnedDate: mvpMonths.length >= 2 ? mvpMonths[1] + '-01' : undefined,
    progress: Math.min(Math.round((bestMvpStreak / 2) * 100), 100),
    progressLabel: `Best: ${bestMvpStreak}/2 months`,
  })

  badges.push({
    id: 'hat-trick',
    name: 'Hat Trick',
    icon: '🎩',
    description: 'Win MVP three months in a row',
    category: 'mvp',
    earned: bestMvpStreak >= 3,
    earnedDate: mvpMonths.length >= 3 ? mvpMonths[2] + '-01' : undefined,
    progress: Math.min(Math.round((bestMvpStreak / 3) * 100), 100),
    progressLabel: `Best: ${bestMvpStreak}/3 months`,
  })

  return badges
}
