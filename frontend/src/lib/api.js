import { getAccessToken } from './auth'

// Only the AI backend lives here now (OpenAI calls need a server-side
// secret key) — everything else (auth, projects, images, products) talks to
// Supabase directly via lib/supabase.js.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) return null

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json().catch(() => null) : null

  if (!response.ok) {
    const message = data?.detail || `Request failed (${response.status})`
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), response.status)
  }

  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
}
