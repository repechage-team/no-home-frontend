import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAgentResponse } from './agentClient.js'

test('parseAgentResponse maps 401 to a login error', () => {
  const result = parseAgentResponse({ status: 401, ok: false, body: null })
  assert.deepEqual(result, { kind: 'error', text: '로그인이 필요합니다.' })
})

test('parseAgentResponse maps 429 with retry hint', () => {
  const result = parseAgentResponse({
    status: 429,
    ok: false,
    body: { success: false, message: '요청이 너무 많습니다.' },
    retryAfter: '30',
  })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /30초 후 다시 시도/)
})

test('parseAgentResponse returns the command on success', () => {
  const command = { action: 'search', filters: { sigungu: '강남구' } }
  const result = parseAgentResponse({
    status: 200,
    ok: true,
    body: { success: true, message: 'ok', data: command },
  })
  assert.deepEqual(result, { kind: 'command', command })
})

test('parseAgentResponse errors when payload has no command object', () => {
  const result = parseAgentResponse({
    status: 200,
    ok: true,
    body: { success: true, message: 'ok', data: null },
  })
  assert.equal(result.kind, 'error')
})

test('parseAgentResponse falls back to server message on failure', () => {
  const result = parseAgentResponse({
    status: 503,
    ok: false,
    body: { success: false, message: 'AI 챗봇이 현재 비활성화되어 있습니다. 관리자에게 문의해주세요.' },
  })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /비활성화/)
})
