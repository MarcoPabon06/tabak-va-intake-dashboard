import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { notificationEmitter } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.email) {
      return new Response('Unauthorized', { status: 401 })
    }

    const username = session.user.email

    const responseStream = new ReadableStream({
      start(controller) {
        // Heartbeat interval to keep connection open (every 20s)
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(':\n\n')
          } catch (e) {
            clearInterval(keepAliveInterval)
          }
        }, 20000)

        // Event listener for new notifications
        const handleNotification = (notification: any) => {
          if (notification.username === username) {
            try {
              controller.enqueue(`data: ${JSON.stringify(notification)}\n\n`)
            } catch (e) {
              cleanup()
            }
          }
        }

        const cleanup = () => {
          clearInterval(keepAliveInterval)
          notificationEmitter.off('notification', handleNotification)
          try {
            controller.close()
          } catch (e) {}
        }

        notificationEmitter.on('notification', handleNotification)

        // If client aborts connection, run cleanup
        req.signal.addEventListener('abort', cleanup)
      }
    })

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      }
    })
  } catch (err: any) {
    return new Response(err.message, { status: 500 })
  }
}
