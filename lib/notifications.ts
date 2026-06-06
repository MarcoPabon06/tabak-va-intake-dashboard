import { EventEmitter } from 'events'
import getDb from './db'

class NotificationEmitter extends EventEmitter {}

const globalForNotifications = globalThis as unknown as {
  notificationEmitter: NotificationEmitter | undefined
}

export const notificationEmitter =
  globalForNotifications.notificationEmitter ?? new NotificationEmitter()

if (process.env.NODE_ENV !== 'production') {
  globalForNotifications.notificationEmitter = notificationEmitter
}

interface NotificationPayload {
  username: string
  title: string
  message: string
  link?: string
}

export function sendNotification({ username, title, message, link }: NotificationPayload) {
  try {
    const db = getDb()
    
    const stmt = db.prepare(`
      INSERT INTO notifications (username, title, message, link)
      VALUES (?, ?, ?, ?)
    `)
    
    const result = stmt.run(username.trim(), title, message, link || null)
    const newId = result.lastInsertRowid

    const notification = {
      id: Number(newId),
      username: username.trim(),
      title,
      message,
      link: link || null,
      read: 0,
      created_at: new Date().toISOString()
    }

    // Broadcast the notification to all active SSE connections
    notificationEmitter.emit('notification', notification)
    
    return notification
  } catch (err) {
    console.error('Failed to send notification:', err)
    return null
  }
}
