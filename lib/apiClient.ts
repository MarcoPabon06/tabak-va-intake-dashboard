/**
 * Centralized, resilient fetch utility with automatic exponential backoff retry.
 * Handles transient network rate limits (429), proxy blips (502/503/504), and concurrent write locks.
 */

export interface SafeFetchOptions extends RequestInit {
  maxRetries?: number
  retryDelayMs?: number
}

export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const baseDelay = options.retryDelayMs ?? 400
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, options)

      // If we encounter a rate limit (429) or transient server gateway error (502, 503, 504)
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt < maxRetries) {
          attempt++
          // Exponential backoff with random jitter: e.g. 400ms -> 800ms -> 1600ms + jitter
          const jitter = Math.floor(Math.random() * 200)
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 4000)
          console.warn(`[apiClient] Received ${res.status} for ${url}. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
      }

      const text = await res.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        if (res.status === 429 || text.toLowerCase().includes('rate limit')) {
          throw new Error('Server rate limit reached. Please wait a moment and try again.')
        }
        throw new Error(text || `Server error (${res.status})`)
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Request failed with status ${res.status}`)
      }

      return data as T
    } catch (err: any) {
      // If error is an abort error from user typing, don't retry, re-throw immediately
      if (err.name === 'AbortError') {
        throw err
      }

      // If we've exhausted retries, throw
      if (attempt >= maxRetries) {
        throw err
      }

      attempt++
      const jitter = Math.floor(Math.random() * 200)
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 4000)
      console.warn(`[apiClient] Network error for ${url}: ${err.message}. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error('Maximum request retries reached.')
}
