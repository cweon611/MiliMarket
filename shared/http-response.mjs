export async function readJsonResponse(response, fallback = '요청을 처리하지 못했습니다.') {
  let data
  try { data = await response.json() } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error(response.ok
      ? '서버 응답 형식을 확인할 수 없습니다. 다시 시도해 주세요.'
      : `${fallback} (HTTP ${response.status})`)
  }
  if (!response.ok) throw new Error(data?.error || fallback)
  return data
}
