import { supabase } from './supabase'

const USER_CACHE_KEY = 'roomlyai_user'

function cacheUser(user) {
  const firstName = user.user_metadata?.first_name
  const lastName = user.user_metadata?.last_name
  const name = [firstName, lastName].filter(Boolean).join(' ')
  const cached = { id: user.id, email: user.email, name: name || undefined }
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cached))
  return cached
}

export async function register(email, password, { firstName, lastName } = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName, last_name: lastName } },
  })
  if (error) throw error
  // With "Confirm email" enabled in Supabase, signUp succeeds but returns no
  // session — the user can't reach /home until they click the emailed link.
  if (!data.session) {
    const pending = new Error('EMAIL_CONFIRMATION_REQUIRED')
    throw pending
  }
  return cacheUser(data.user)
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return cacheUser(data.user)
}

export async function logout() {
  await supabase.auth.signOut()
  localStorage.removeItem(USER_CACHE_KEY)
}

export async function isAuthenticated() {
  const { data } = await supabase.auth.getSession()
  return Boolean(data.session)
}

/** Access token for calling the separate AI backend (OpenAI-backed endpoints). */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Cached synchronously from the last login/register — good enough for display (e.g. topbar). */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
