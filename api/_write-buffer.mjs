export const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export function mergePatches(base, batch) {
  const out = {...base}
  for (const [id, patch] of Object.entries(batch)) out[id] = {...out[id], ...patch}
  return out
}

// Serialize writers and keep failed batches queued. A newer value queued while
// writing always wins over the failed value being restored.
export function createWriteBuffer({write, paused = () => false, onError}) {
  let pending = {}, writing = null

  async function flush() {
    while (writing || Object.keys(pending).length) {
      if (paused()) return
      if (!writing) {
        const batch = pending
        pending = {}
        writing = write(batch).catch(error => {
          pending = mergePatches(batch, pending)
          throw error
        }).finally(() => { writing = null })
      }
      try { await writing } catch (error) { onError(error); return }
    }
  }

  return {
    queue(patch) { pending = mergePatches(pending, patch) },
    pending: () => pending,
    flush,
  }
}
