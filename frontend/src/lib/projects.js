import { supabase } from './supabase'

export const PROJECT_FLOW = [
  { id: 'room-input', title: 'รายละเอียดและภาพห้องเปล่า', progress: 16 },
  { id: 'ai-generate', title: 'AI Generate', progress: 33 },
  { id: 'result', title: 'ดูผลลัพธ์', progress: 50 },
  { id: 'object-decision', title: 'Keep / Replace / Remove', progress: 67 },
  { id: 'product-matching', title: 'สินค้า IKEA / Shopee', progress: 84 },
  { id: 'saved', title: 'บันทึกโปรเจกต์', progress: 100 },
]

const WORKFLOW_KEY = '__workflow'

export function getObjectDecisions(decisions = {}) {
  return Object.fromEntries(Object.entries(decisions).filter(([key]) => !key.startsWith('__')))
}

export function getWorkflowData(decisions = {}) {
  return decisions?.[WORKFLOW_KEY] ?? {}
}

export function withWorkflowData(decisions = {}, patch = {}) {
  return {
    ...decisions,
    [WORKFLOW_KEY]: {
      ...getWorkflowData(decisions),
      ...patch,
    },
  }
}

/**
 * Pair every original image with its own AI result. Older projects only have
 * `generatedImageUrl`; that legacy result belongs to the first image only.
 */
export function getRoomDesigns(project, images = []) {
  const stored = project?.generatedImages ?? []
  return images.map((image, index) => {
    const result = stored.find((item) => (
      item.sourceImageId === image.id || item.sourceImageUrl === image.url
    ))
    return {
      sourceImageId: image.id,
      sourceImageUrl: image.url,
      generatedImageUrl: result?.generatedImageUrl
        ?? (!stored.length && index === 0 ? project?.generatedImageUrl : undefined),
      // Earlier/undone versions of this room's AI image (already in Storage),
      // so removing/replacing an object can be undone without calling AI.
      history: result?.history ?? [],
      future: result?.future ?? [],
    }
  })
}

// Postgres columns are snake_case; frontend pages use camelCase — map at
// this one boundary so pages don't need to change.
function fromRow(row) {
  if (!row) return null
  const decisions = row.decisions ?? {}
  const workflow = getWorkflowData(decisions)
  return {
    id: row.id,
    name: row.name,
    roomType: row.room_type,
    style: row.style,
    budget: row.budget,
    requirements: row.requirements ?? [],
    dimensions: row.dimensions ?? undefined,
    notes: row.notes ?? undefined,
    stage: row.stage,
    status: row.status,
    progress: row.progress,
    hasRoomImage: row.has_room_image,
    aiInstructions: row.ai_instructions ?? '',
    generatedImageUrl: row.generated_image_url ?? undefined,
    decisions,
    generatedImages: workflow.generatedImages ?? [],
    detectedObjects: workflow.detectedObjects ?? [],
    plannedProducts: workflow.plannedProducts ?? [],
    replacementBriefs: decisions.__replacementBriefs ?? {},
    productSelections: row.product_selections ?? {},
    estimatedTotal: row.estimated_total ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
  }
}

const FIELD_MAP = {
  name: 'name',
  roomType: 'room_type',
  style: 'style',
  budget: 'budget',
  requirements: 'requirements',
  dimensions: 'dimensions',
  notes: 'notes',
  stage: 'stage',
  status: 'status',
  progress: 'progress',
  hasRoomImage: 'has_room_image',
  aiInstructions: 'ai_instructions',
  generatedImageUrl: 'generated_image_url',
  decisions: 'decisions',
  productSelections: 'product_selections',
  estimatedTotal: 'estimated_total',
}

function toRow(patch) {
  const row = {}
  for (const [key, value] of Object.entries(patch)) {
    if (FIELD_MAP[key]) row[FIELD_MAP[key]] = value
  }
  return row
}

export async function getProjects() {
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function getProject(id) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return fromRow(data)
}

export async function addProject(data) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: row, error } = await supabase
    .from('projects')
    .insert({ ...toRow(data), owner_id: user.id })
    .select()
    .single()
  if (error) throw error
  return fromRow(row)
}

export async function updateProject(id, patch) {
  const { data: row, error } = await supabase
    .from('projects')
    .update({ ...toRow(patch), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return fromRow(row)
}

export async function removeProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
