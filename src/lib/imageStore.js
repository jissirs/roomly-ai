const DB_NAME = 'roomlyai-local-assets'
const STORE_NAME = 'project-images'
const DB_VERSION = 1

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'projectId' })
      }
    }
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveProjectImages(projectId, newFiles) {
  if (!newFiles.length) return
  const database = await openDatabase()
  const readTransaction = database.transaction(STORE_NAME, 'readonly')
  const existing = await requestResult(readTransaction.objectStore(STORE_NAME).get(projectId))
  const writeTransaction = database.transaction(STORE_NAME, 'readwrite')
  await requestResult(writeTransaction.objectStore(STORE_NAME).put({
    projectId,
    files: [...(existing?.files ?? []), ...newFiles],
  }))
  database.close()
}

export async function getProjectImages(projectId) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const record = await requestResult(transaction.objectStore(STORE_NAME).get(projectId))
  database.close()
  return record?.files ?? []
}

export async function deleteProjectImages(projectId) {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  await requestResult(transaction.objectStore(STORE_NAME).delete(projectId))
  database.close()
}
