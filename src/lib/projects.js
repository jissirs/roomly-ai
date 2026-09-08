const STORAGE_KEY = 'roomlyai_projects'

export const PROJECT_FLOW = [
  { id: 'room-input', title: 'รายละเอียดและภาพห้องเปล่า', progress: 16 },
  { id: 'ai-generate', title: 'AI Generate', progress: 33 },
  { id: 'result', title: 'ดูผลลัพธ์', progress: 50 },
  { id: 'object-decision', title: 'Keep / Replace / Remove', progress: 67 },
  { id: 'product-matching', title: 'สินค้า IKEA / Shopee', progress: 84 },
  { id: 'saved', title: 'บันทึกโปรเจกต์', progress: 100 },
]

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeAll(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function getProjects() {
  return readAll().sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
}

export function getProject(id) {
  return readAll().find((project) => project.id === id) ?? null
}

export function addProject(data) {
  const project = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...data,
  }
  writeAll([...readAll(), project])
  return project
}

export function updateProject(id, patch) {
  const projects = readAll().map((project) =>
    project.id === id ? { ...project, ...patch, updatedAt: Date.now() } : project,
  )
  writeAll(projects)
}

export function removeProject(id) {
  writeAll(readAll().filter((project) => project.id !== id))
}
