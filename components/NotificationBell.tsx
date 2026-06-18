'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface Notification {
  id: number
  username: string
  title: string
  message: string
  link: string | null
  read: number
  created_at: string
}

export default function NotificationBell() {
  const { data: session } = useSession()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [toast, setToast] = useState<Notification | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => n.read === 0).length

  // Fetch initial notifications
  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    }
  }

  useEffect(() => {
    if (!session?.user?.email) return

    fetchNotifications()

    // Establish Server-Sent Events (SSE) connection for real-time notifications
    const eventSource = new EventSource('/api/notifications/sse')

    eventSource.onmessage = (event) => {
      try {
        const newNotification: Notification = JSON.parse(event.data)
        
        // Add to state (prepend)
        setNotifications((prev) => [newNotification, ...prev])
        
        // Show live Toast alert
        setToast(newNotification)
      } catch (err) {
        console.error('Failed to parse SSE message:', err)
      }
    }

    eventSource.onerror = () => {
      // EventSource automatically handles reconnection, but we log the error
      console.warn('SSE connection interrupted. Reconnecting...')
    }

    // Close connection on unmount
    return () => {
      eventSource.close()
    }
  }, [session?.user?.email])

  // Auto-hide toast after 6 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mark all as read
  async function markAllAsRead() {
    try {
      const res = await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' } })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })))
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  // Click single notification
  async function handleNotificationClick(n: Notification) {
    setIsOpen(false)
    if (n.read === 0) {
      try {
        await fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id }),
        })
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, read: 1 } : item))
        )
      } catch (err) {
        console.error('Failed to mark notification as read:', err)
      }
    }
    if (n.link) {
      router.push(n.link)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          borderRadius: 8,
          transition: 'background 0.2s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        {unreadCount > 0 && (
          <span
            id="notification-badge"
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: '#ef4444',
              color: 'white',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: '50%',
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)',
              padding: '0 2px',
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id="notification-dropdown"
          className="glass-card"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            width: 290,
            maxHeight: 350,
            overflowY: 'auto',
            marginBottom: 8,
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            borderColor: 'rgba(184, 33, 5, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Dropdown Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                id="btn-mark-all-read"
                onClick={markAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#b82105',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    background: n.read === 0 ? 'rgba(184, 33, 5, 0.08)' : 'transparent',
                    transition: 'background 0.2s',
                    position: 'relative',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = n.read === 0 ? 'rgba(184, 33, 5, 0.08)' : 'transparent')}
                >
                  {n.read === 0 && (
                    <div style={{
                      position: 'absolute',
                      top: 15,
                      left: 6,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#b82105',
                    }} />
                  )}
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Floating Live Toast Alert */}
      {toast && (
        <div
          id="notification-toast"
          className="glass-card"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            width: 320,
            padding: '16px 20px',
            background: 'rgba(10, 22, 40, 0.95)',
            borderColor: 'rgba(184, 33, 5, 0.4)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 24 }}>🔔</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{toast.title}</h4>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {toast.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 16,
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => setToast(null)}
              style={{ padding: '6px 14px', fontSize: 11 }}
            >
              Dismiss
            </button>
            <button
              id="btn-toast-view"
              className="btn-primary"
              onClick={() => {
                setToast(null)
                if (toast.link) router.push(toast.link)
              }}
              style={{ padding: '6px 14px', fontSize: 11 }}
            >
              View QA Scores
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
