import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const db = getDb()

    // 1. Total records count
    const totalPerformance = db.prepare('SELECT COUNT(*) as cnt FROM daily_performance').get() as { cnt: number }
    const totalAgents = db.prepare('SELECT COUNT(*) as cnt FROM agents').get() as { cnt: number }
    const totalUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }

    // 2. Agents list
    const agentsList = db.prepare('SELECT * FROM agents').all()

    // 3. Unique agent names in daily_performance
    const perfAgents = db.prepare('SELECT DISTINCT agent_name FROM daily_performance').all() as { agent_name: string }[]

    // 4. Sample of recent dates in daily_performance
    const sampleDates = db.prepare('SELECT DISTINCT date FROM daily_performance ORDER BY date DESC LIMIT 15').all() as { date: string }[]

    // 5. Check if any agents match the INNER JOIN used in dashboard
    const joinedSample = db.prepare(`
      SELECT dp.agent_name, a.name as agent_table_name, a.lob, COUNT(dp.id) as record_count
      FROM daily_performance dp
      LEFT JOIN agents a ON dp.agent_name = a.name
      GROUP BY dp.agent_name
    `).all()

    return NextResponse.json({
      summary: {
        total_performance_rows: totalPerformance.cnt,
        total_agents_in_table: totalAgents.cnt,
        total_users: totalUsers.cnt
      },
      agents: agentsList,
      performance_unique_agents: perfAgents.map(a => a.agent_name),
      recent_performance_dates: sampleDates.map(d => d.date),
      join_analysis: joinedSample
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
