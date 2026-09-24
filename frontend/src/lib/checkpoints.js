import { supabase } from './supabase'

// Editable project columns captured in a checkpoint (DB column names, so a
// restore is a direct update). Original uploaded photos are shared storage
// and are intentionally not part of a snapshot.
const SNAPSHOT_COLUMNS = [
  'name', 'room_type', 'style', 'budget', 'requirements', 'dimensions', 'notes',
  'stage', 'status', 'progress', 'has_room_image', 'ai_instructions',
  'generated_image_url', 'decisions', 'product_selections', 'estimated_total',
]

function pickSnapshot(row) {
  return Object.fromEntries(SNAPSHOT_COLUMNS.map((column) => [column, row[column] ?? null]))
}

async function fetchProjectRow(projectId) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
  if (error) throw error
  return data
}

export async function listCheckpoints(projectId) {
  const { data, error } = await supabase
    .from('project_checkpoints')
    .select('id, name, snapshot, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    stage: row.snapshot?.stage,
    style: row.snapshot?.style,
    budget: row.snapshot?.budget,
    hasGeneratedImage: Boolean(row.snapshot?.generated_image_url),
  }))
}

export async function createCheckpoint(projectId, name) {
  const [row, { data: { user } }] = await Promise.all([fetchProjectRow(projectId), supabase.auth.getUser()])
  const { error } = await supabase.from('project_checkpoints').insert({
    project_id: projectId,
    owner_id: user.id,
    name: name.trim() || 'Checkpoint',
    snapshot: pickSnapshot(row),
  })
  if (error) throw error
}

/** Saves the current state as an "auto" checkpoint first, so a restore is itself undoable. */
export async function restoreCheckpoint(projectId, checkpointId) {
  const { data, error } = await supabase
    .from('project_checkpoints').select('snapshot').eq('id', checkpointId).single()
  if (error) throw error
  await createCheckpoint(projectId, 'ก่อนย้อนกลับ (อัตโนมัติ)')
  const { error: updateError } = await supabase
    .from('projects')
    .update({ ...data.snapshot, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (updateError) throw updateError
}

export async function deleteCheckpoint(checkpointId) {
  const { error } = await supabase.from('project_checkpoints').delete().eq('id', checkpointId)
  if (error) throw error
}
