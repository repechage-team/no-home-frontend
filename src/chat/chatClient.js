// Framework-free helpers for the AI chat widget.
// Extracted from ChatWidget.vue so the bug-prone parts (HTTP status mapping,
// Unicode-safe length) can be unit-tested with `node --test`.

export const MAX_MESSAGE_LENGTH = 500

// Progress messages shown while waiting for an answer.
// delayMs is relative to send time; the first stage (0) is shown immediately.
export const PROGRESS_STAGES = [
  { delayMs: 0, text: '질문을 전송했어요. 답변을 기다리고 있어요…' },
  { delayMs: 3000, text: '실거래가 데이터를 확인하고 있어요…' },
  { delayMs: 12000, text: '답변이 평소보다 오래 걸리고 있어요. 조금만 더 기다려주세요…' },
]

// Count by Unicode code points (not UTF-16 units), matching the backend's
// code-point based limit. Avoids the HTML `maxlength` (UTF-16) mismatch where
// emoji/surrogate pairs are counted as 2.
export function messageLength(text) {
  return Array.from(text ?? '').length
}

// Truncate to at most `max` code points without splitting a surrogate pair.
export function clampToMaxLength(text, max = MAX_MESSAGE_LENGTH) {
  const value = text ?? ''
  const chars = Array.from(value)
  return chars.length <= max ? value : chars.slice(0, max).join('')
}

function retryHint(retryAfter) {
  const seconds = Number.parseInt(retryAfter ?? '', 10)
  return Number.isFinite(seconds) && seconds > 0
    ? ` ${seconds}초 후 다시 시도할 수 있어요.`
    : ''
}

// Map an /api/ai/chat response into a chat message.
// Returns { kind: 'answer' | 'error', text } so the caller never has to branch
// on raw status codes. 401/429 get tailored copy; 409/503/504 and any other
// failure fall back to the server's ApiResponse message.
export function parseChatResponse({ status, ok, body, retryAfter } = {}) {
  if (status === 401) {
    return { kind: 'error', text: '로그인이 필요합니다.' }
  }
  if (status === 429) {
    const base = body?.message || '질문 요청이 너무 많습니다.'
    return { kind: 'error', text: `${base}${retryHint(retryAfter)}` }
  }
  if (!ok || body?.success === false) {
    return { kind: 'error', text: body?.message || `요청 실패 (${status})` }
  }
  const answer = body?.data ?? '응답을 받지 못했습니다.'
  return { kind: 'answer', text: String(answer) }
}
