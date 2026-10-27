import { supabase } from './supabase'

const BUCKET = 'room-images'
export const MAX_ROOM_IMAGES = 6

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

async function removeFolder(folder) {
  const { data } = await supabase.storage.from(BUCKET).list(folder)
  if (!data?.length) return
  const { error } = await supabase.storage.from(BUCKET).remove(data.map((file) => `${folder}/${file.name}`))
  if (error) throw error
}

/** Removes only the AI-generated pictures (`generated/{id}/`), e.g. when a project's results are reset. */
export const deleteGeneratedImages = (projectId) => removeFolder(`generated/${projectId}`)

/** Removes the room photos and the AI-generated pictures of a project. */
export async function deleteProjectImages(projectId) {
  await removeFolder(projectId)
  await deleteGeneratedImages(projectId)
}

export async function deleteProjectImagesByPath(paths) {
  if (!paths.length) return
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) throw error
}
