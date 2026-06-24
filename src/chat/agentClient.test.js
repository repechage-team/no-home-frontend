import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAgentResponse, parseAssistantResponse } from './agentClient.js'

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

test('parseAssistantResponse maps an answer payload to a text bubble', () => {
  const result = parseAssistantResponse({
    status: 200,
    ok: true,
    body: { success: true, data: { type: 'answer', answer: '마포구 평균은 13억원입니다.' } },
  })
  assert.deepEqual(result, { kind: 'answer', text: '마포구 평균은 13억원입니다.' })
})

test('parseAssistantResponse maps a command payload to a command', () => {
  const command = { action: 'search', filters: { sigungu: '강남구' } }
  const result = parseAssistantResponse({
    status: 200,
    ok: true,
    body: { success: true, data: { type: 'command', command, notice: null } },
  })
  assert.equal(result.kind, 'command')
  assert.deepEqual(result.command, command)
})

test('parseAssistantResponse maps 401/429 to errors', () => {
  assert.equal(parseAssistantResponse({ status: 401, ok: false, body: null }).kind, 'error')
  assert.equal(
    parseAssistantResponse({ status: 429, ok: false, body: { message: 'too many' }, retryAfter: '5' }).kind,
    'error',
  )
})

test('parseAssistantResponse errors when data or command is missing', () => {
  assert.equal(parseAssistantResponse({ status: 200, ok: true, body: { success: true, data: null } }).kind, 'error')
  assert.equal(
    parseAssistantResponse({ status: 200, ok: true, body: { success: true, data: { type: 'command', command: null } } }).kind,
    'error',
  )
})

test('parseAssistantResponse falls back to friendly text when answer is empty', () => {
  const result = parseAssistantResponse({
    status: 200,
    ok: true,
    body: { success: true, data: { type: 'answer', answer: '' } },
  })
  assert.equal(result.kind, 'answer')
  assert.match(result.text, /응답을 받지 못했습니다/)
})
