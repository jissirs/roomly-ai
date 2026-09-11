import { supabase } from './supabase'

const BUCKET = 'room-images'

export async function saveProjectImages(projectId, files) {
  for (const file of files) {
    const extension = file.name.split('.').pop()
    const path = `${projectId}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file)
    if (error) throw error
  }
}

/** Returns stable image ids as well as URLs so generated results can be paired. */
export async function getProjectImages(projectId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(projectId)
  if (error || !data) return []
  return data
    .filter((file) => file.name && file.name !== '.emptyFolderPlaceholder')
    .map((file) => {
      const path = `${projectId}/${file.name}`
      return {
        id: file.id ?? file.name,
        name: file.name,
        path,
        createdAt: file.created_at,
        url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      }
    })
    .sort((first, second) => String(first.createdAt ?? first.name).localeCompare(String(second.createdAt ?? second.name)))
}

export async function deleteProjectImages(projectId) {
  const { data } = await supabase.storage.from(BUCKET).list(projectId)
  if (!data?.length) return
  await supabase.storage.from(BUCKET).remove(data.map((file) => `${projectId}/${file.name}`))
}
