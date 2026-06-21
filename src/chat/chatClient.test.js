import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_MESSAGE_LENGTH,
  PROGRESS_STAGES,
  messageLength,
  clampToMaxLength,
  parseChatResponse,
} from './chatClient.js'

test('messageLength counts Unicode code points, not UTF-16 units', () => {
  assert.equal(messageLength('hello'), 5)
  assert.equal(messageLength('안녕'), 2)
  assert.equal(messageLength('😀'), 1) // surrogate pair -> 1
  assert.equal(messageLength('a😀b'), 3)
  assert.equal(messageLength(''), 0)
  assert.equal(messageLength(null), 0)
})

test('clampToMaxLength truncates by code point without splitting surrogate pairs', () => {
  assert.equal(clampToMaxLength('abc', 5), 'abc')
  assert.equal(clampToMaxLength('abcdef', 3), 'abc')
  // 3 emojis, limit 2 -> exactly 2 emojis, no broken surrogate
  assert.equal(clampToMaxLength('😀😀😀', 2), '😀😀')
  assert.equal(messageLength(clampToMaxLength('😀😀😀', 2)), 2)
  assert.equal(clampToMaxLength(null, 5), '')
})

test('PROGRESS_STAGES has an immediate first stage and later delays', () => {
  assert.equal(PROGRESS_STAGES[0].delayMs, 0)
  assert.ok(PROGRESS_STAGES.length >= 2)
  assert.ok(PROGRESS_STAGES.slice(1).every((s) => s.delayMs > 0))
})

test('parseChatResponse: success returns the answer', () => {
  const r = parseChatResponse({ status: 200, ok: true, body: { success: true, data: '동작구 평균 15억' } })
  assert.deepEqual(r, { kind: 'answer', text: '동작구 평균 15억' })
})

test('parseChatResponse: success with null data uses fallback', () => {
  const r = parseChatResponse({ status: 200, ok: true, body: { success: true, data: null } })
  assert.equal(r.kind, 'answer')
  assert.equal(r.text, '응답을 받지 못했습니다.')
})

test('parseChatResponse: 401 -> login required', () => {
  const r = parseChatResponse({ status: 401, ok: false, body: { success: false, message: 'x' } })
  assert.deepEqual(r, { kind: 'error', text: '로그인이 필요합니다.' })
})

test('parseChatResponse: 429 appends Retry-After hint when present', () => {
  const r = parseChatResponse({ status: 429, ok: false, body: { message: '요청이 많습니다.' }, retryAfter: '30' })
  assert.equal(r.kind, 'error')
  assert.match(r.text, /요청이 많습니다\./)
  assert.match(r.text, /30초 후 다시 시도할 수 있어요\./)
})

test('parseChatResponse: 429 without valid Retry-After has no hint', () => {
  const r = parseChatResponse({ status: 429, ok: false, body: {}, retryAfter: null })
  assert.equal(r.kind, 'error')
  assert.equal(r.text, '질문 요청이 너무 많습니다.')
})

test('parseChatResponse: 409 duplicate uses server message', () => {
  const r = parseChatResponse({ status: 409, ok: false, body: { success: false, message: '이미 처리 중입니다.' } })
  assert.deepEqual(r, { kind: 'error', text: '이미 처리 중입니다.' })
})

test('parseChatResponse: 503/504 use server message', () => {
  assert.equal(
    parseChatResponse({ status: 503, ok: false, body: { message: 'AI 응답 생성에 실패했습니다.' } }).text,
    'AI 응답 생성에 실패했습니다.',
  )
  assert.equal(
    parseChatResponse({ status: 504, ok: false, body: { message: '응답 시간이 초과되었습니다.' } }).text,
    '응답 시간이 초과되었습니다.',
  )
})

test('parseChatResponse: failure without body falls back to status text', () => {
  const r = parseChatResponse({ status: 500, ok: false, body: null })
  assert.deepEqual(r, { kind: 'error', text: '요청 실패 (500)' })
})

test('MAX_MESSAGE_LENGTH is 500', () => {
  assert.equal(MAX_MESSAGE_LENGTH, 500)
})
