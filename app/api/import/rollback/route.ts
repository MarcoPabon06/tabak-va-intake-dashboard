import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const isSuper = userRole === 'master' || userRole === 'superadmin'
    const isAdmin = userRole === 'admin'

    if (!isSuper && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Team Leads and Admins can rollback imports' }, { status: 403 })
    }

    const body = await req.json()
    const { batch_id } = body
    if (!batch_id) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 })
    }

    const db = getDb()

    const batch = db.prepare(`SELECT * FROM import_batches WHERE batch_id = ?`).get(batch_id) as any
    if (!batch) {
      return NextResponse.json({ error: 'Import batch not found' }, { status: 404 })
    }

    if (batch.status === 'ROLLED_BACK') {
      return NextResponse.json({ error: 'This import batch has already been rolled back' }, { status: 400 })
    }

    const sessionUsername = (session.user as any)?.email || session.user?.name || 'admin'
    const sessionDisplayName = session.user?.name || sessionUsername

    let recordsDeleted = 0
    let recordsRestored = 0

    const rollbackTx = db.transaction(() => {
      // 1. Delete all records created in this batch
      if (batch.upload_type === 'ssd_converted_sync') {
        try {
          const delRes = db.prepare(`DELETE FROM ssd_converted_records WHERE import_batch_id = ?`).run(batch.batch_id)
          recordsDeleted += delRes.changes
        } catch (e: any) {
          console.warn('[rollback] Note on deleting ssd_converted_records:', e.message)
        }
      } else if (batch.lob === 'SSD' || batch.upload_type.startsWith('ssd_')) {
        try {
          const delRes = db.prepare(`DELETE FROM ssd_lead_records WHERE import_batch_id = ?`).run(batch.batch_id)
          recordsDeleted += delRes.changes
        } catch (e: any) {
          console.warn('[rollback] Note on deleting ssd_lead_records:', e.message)
        }
      } else if (batch.lob === 'VA' || batch.upload_type.startsWith('va_')) {
        try {
          const delRes = db.prepare(`DELETE FROM va_lead_records WHERE import_batch_id = ?`).run(batch.batch_id)
          recordsDeleted += delRes.changes
        } catch (e: any) {
          console.warn('[rollback] Note on deleting va_lead_records:', e.message)
        }
      }

      // 2. Restore any records that were updated, from snapshot_data
      if (batch.snapshot_data) {
        let snapshots: any[] = []
        try {
          snapshots = JSON.parse(batch.snapshot_data)
        } catch (e) {
          console.error('Failed to parse snapshot_data JSON:', e)
        }

        if (Array.isArray(snapshots) && snapshots.length > 0) {
          if (batch.upload_type === 'ssd_converted_sync') {
            for (const snap of snapshots) {
              if (snap.created) {
                db.prepare(`DELETE FROM daily_performance WHERE id = ?`).run(snap.id)
                recordsDeleted++
              } else {
                db.prepare(`UPDATE daily_performance SET converted_cases = ? WHERE id = ?`).run(
                  snap.previous_converted_cases || 0,
                  snap.id
                )
                recordsRestored++
              }
            }
          } else if (batch.lob === 'SSD' || batch.upload_type.startsWith('ssd_')) {
            const restoreStmt = db.prepare(`
              UPDATE ssd_lead_records SET
                status = ?,
                is_converted = ?,
                converted_at = ?,
                signed_at = ?,
                claim_type = ?,
                outcome_reason = ?,
                other_reason_notes = ?,
                updated_at = (datetime('now')),
                last_edited_by = ?
              WHERE id = ?
            `)

            for (const snap of snapshots) {
              restoreStmt.run(
                snap.status,
                snap.is_converted || 0,
                snap.converted_at || null,
                snap.signed_at || null,
                snap.claim_type || null,
                snap.outcome_reason || null,
                snap.other_reason_notes || null,
                `Rollback by ${sessionDisplayName}`,
                snap.id
              )
              recordsRestored++
            }
          } else if (batch.lob === 'VA' || batch.upload_type.startsWith('va_')) {
            const restoreStmt = db.prepare(`
              UPDATE va_lead_records SET
                status = ?,
                outcome_reason = ?,
                other_reason_notes = ?,
                signed_at = ?,
                updated_at = (datetime('now')),
                last_edited_by = ?
              WHERE id = ?
            `)

            for (const snap of snapshots) {
              restoreStmt.run(
                snap.status,
                snap.outcome_reason || null,
                snap.other_reason_notes || null,
                snap.signed_at || null,
                `Rollback by ${sessionDisplayName}`,
                snap.id
              )
              recordsRestored++
            }
          }
        }
      }

      // 3. Mark batch as ROLLED_BACK
      db.prepare(`
        UPDATE import_batches SET
          status = 'ROLLED_BACK',
          rolled_back_at = (datetime('now')),
          rolled_back_by = ?
        WHERE batch_id = ?
      `).run(sessionDisplayName, batch.batch_id)
    })

    rollbackTx()

    return NextResponse.json({
      success: true,
      batch_id: batch.batch_id,
      records_deleted: recordsDeleted,
      records_restored: recordsRestored,
      message: `Successfully rolled back import "${batch.filename}". Removed ${recordsDeleted} created records and restored ${recordsRestored} updated records.`,
    })
  } catch (err: any) {
    console.error('[import/rollback error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to rollback import batch' }, { status: 500 })
  }
}
