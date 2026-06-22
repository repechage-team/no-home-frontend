<script>
import {
  MAX_MESSAGE_LENGTH,
  PROGRESS_STAGES,
  clampToMaxLength,
  messageLength,
  parseChatResponse,
} from '../chat/chatClient.js'
import { parseAgentResponse } from '../chat/agentClient.js'
import { capabilities } from '../houseSearchParams.js'

export default {
  name: 'ChatWidget',
  props: {
    loggedIn: {
      type: Boolean,
      default: false,
    },
    // 에이전트 모드용: 서버는 무상태이므로 현재 UI 상태를 함께 보낸다(App.vue가 전달).
    currentFilters: {
      type: Object,
      default: () => ({}),
    },
    currentPage: {
      type: Number,
      default: 1,
    },
    totalPages: {
      type: Number,
      default: 1,
    },
    // App.vue가 명령을 적용한 뒤 돌려주는 권위 있는 요약. { text, seq } 형태로 매번 새 객체.
    agentResult: {
      type: Object,
      default: null,
    },
  },
  emits: ['agent-command'],
  data() {
    return {
      open: false,
      mode: 'question', // 'question' | 'agent'
      input: '',
      loading: false,
      loadingStatus: '',
      progressTimers: [],
      messages: [
        {
          role: 'assistant',
          text: '안녕하세요! 서울 아파트 실거래가를 물어보세요. 예) "강남구 2024년 5월 평균 거래가 알려줘"',
        },
      ],
    }
  },
  computed: {
    maxLength() {
      return MAX_MESSAGE_LENGTH
    },
    inputLength() {
      return messageLength(this.input)
    },
    latestAssistantText() {
      for (let i = this.messages.length - 1; i >= 0; i -= 1) {
        if (this.messages[i].role === 'assistant') {
          return this.messages[i].text
        }
      }
      return ''
    },
  },
  watch: {
    input(value) {
      // Enforce the limit by code points (not HTML maxlength's UTF-16 units).
      const clamped = clampToMaxLength(value)
      if (clamped !== value) {
        this.input = clamped
      }
    },
    // App.vue가 명령을 적용한 뒤 권위 있는 요약을 돌려주면 답변 버블로 표시하고 로딩을 종료한다.
    agentResult(result) {
      if (!result) {
        return
      }
      this.clearProgressTimers()
      this.loading = false
      if (result.text) {
        this.messages.push({ role: 'assistant', text: result.text })
      }
      this.scrollToBottom()
    },
  },
  beforeUnmount() {
    this.clearProgressTimers()
  },
  methods: {
    toggle() {
      this.open = !this.open
      if (this.open) {
        this.$nextTick(() => this.focusInput())
      }
    },
    setMode(mode) {
      if (this.mode === mode || this.loading) {
        return
      }
      this.mode = mode
      this.$nextTick(() => this.focusInput())
    },
    focusInput() {
      const el = this.$refs.input
      if (el) {
        el.focus()
      }
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.scroll
        if (el) {
          el.scrollTop = el.scrollHeight
        }
      })
    },
    startProgress() {
      this.clearProgressTimers()
      this.loadingStatus = PROGRESS_STAGES[0].text
      this.progressTimers = PROGRESS_STAGES.slice(1).map((stage) =>
        setTimeout(() => {
          this.loadingStatus = stage.text
          this.scrollToBottom()
        }, stage.delayMs),
      )
    },
    clearProgressTimers() {
      this.progressTimers.forEach((timer) => clearTimeout(timer))
      this.progressTimers = []
      this.loadingStatus = ''
    },
    async send() {
      const message = this.input.trim()
      if (!message || this.loading) {
        return
      }

      if (!this.loggedIn) {
        this.messages.push({ role: 'assistant', text: '로그인 후 이용할 수 있어요.' })
        this.scrollToBottom()
        return
      }

      this.messages.push({ role: 'user', text: message })
      this.input = ''
      this.loading = true
      this.startProgress()
      this.scrollToBottom()

      if (this.mode === 'agent') {
        await this.sendAgent(message)
      } else {
        await this.sendQuestion(message)
      }
    },
    async sendQuestion(message) {
      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ message }),
        })
        const body = await response.json().catch(() => null)
        const result = parseChatResponse({
          status: response.status,
          ok: response.ok,
          body,
          retryAfter: response.headers.get('Retry-After'),
        })
        this.messages.push({ role: 'assistant', text: result.text })
      } catch (error) {
        this.messages.push({ role: 'assistant', text: error.message || '오류가 발생했습니다.' })
      } finally {
        this.clearProgressTimers()
        this.loading = false
        this.scrollToBottom()
      }
    },
    async sendAgent(message) {
      try {
        const response = await fetch('/api/ai/agent', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            message,
            capabilities: capabilities(),
            currentFilters: this.currentFilters,
            currentPage: this.currentPage,
            totalPages: this.totalPages,
          }),
        })
        const body = await response.json().catch(() => null)
        const result = parseAgentResponse({
          status: response.status,
          ok: response.ok,
          body,
          retryAfter: response.headers.get('Retry-After'),
        })
        if (result.kind === 'command') {
          // 명령 적용은 App.vue가 수행하고 권위 있는 요약을 agentResult로 돌려준다.
          // 그때까지 로딩을 유지하고, 진행 표시만 정적 문구로 바꾼다.
          this.clearProgressTimers()
          this.loadingStatus = '요청을 처리하고 있어요…'
          this.$emit('agent-command', result.command)
        } else {
          this.clearProgressTimers()
          this.loading = false
          this.messages.push({ role: 'assistant', text: result.text })
          this.scrollToBottom()
        }
      } catch (error) {
        this.clearProgressTimers()
        this.loading = false
        this.messages.push({ role: 'assistant', text: error.message || '오류가 발생했습니다.' })
        this.scrollToBottom()
      }
    },
  },
}
</script>

<template>
  <div class="chat-widget">
    <button
      v-if="!open"
      class="chat-fab"
      type="button"
      aria-label="AI 챗봇 열기"
      @click="toggle"
    >
      💬 AI
    </button>

    <section v-else class="chat-panel" aria-label="AI 챗봇" :aria-busy="loading">
      <header class="chat-header">
        <span>NoHome AI 도우미</span>
        <button class="chat-close" type="button" aria-label="닫기" @click="toggle">✕</button>
      </header>

      <div class="chat-mode" role="group" aria-label="모드 선택">
        <button
          type="button"
          class="chat-mode-btn"
          :class="{ 'is-active': mode === 'question' }"
          :aria-pressed="mode === 'question'"
          :disabled="loading"
          @click="setMode('question')"
        >질문</button>
        <button
          type="button"
          class="chat-mode-btn"
          :class="{ 'is-active': mode === 'agent' }"
          :aria-pressed="mode === 'agent'"
          :disabled="loading"
          @click="setMode('agent')"
        >실행</button>
      </div>

      <div ref="scroll" class="chat-messages">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="chat-message"
          :class="msg.role === 'user' ? 'is-user' : 'is-assistant'"
        >
          <p>{{ msg.text }}</p>
        </div>
        <div v-if="loading" class="chat-message is-assistant chat-progress" role="status" aria-live="polite">
          <span class="chat-progress-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <p class="chat-typing">{{ loadingStatus }}</p>
        </div>
      </div>

      <!-- Politely announces the latest answer to screen readers (visible bubbles are not a live region). -->
      <p class="chat-visually-hidden" aria-live="polite">{{ loading ? '' : latestAssistantText }}</p>

      <p v-if="!loggedIn" class="chat-notice">로그인 후 이용할 수 있어요.</p>
      <p v-else-if="loading" class="chat-notice is-loading">
        질문이 전송되었습니다. 답변이 끝날 때까지 입력창이 잠깁니다.
      </p>

      <form class="chat-input-row" @submit.prevent="send">
        <label for="chat-message-input" class="chat-visually-hidden">질문 입력</label>
        <span id="chat-input-hint" class="chat-visually-hidden">최대 {{ maxLength }}자까지 입력할 수 있어요.</span>
        <div class="chat-input-wrap">
          <input
            id="chat-message-input"
            ref="input"
            v-model="input"
            class="chat-input"
            type="text"
            aria-describedby="chat-input-hint chat-input-counter"
            :placeholder="loading ? '답변을 기다리는 중입니다' : (mode === 'agent' ? '예) 마포구 2024년 3월로 검색해줘' : '예) 마포구 2024년 3월 실거래가')"
            :disabled="loading"
          />
          <span id="chat-input-counter" class="chat-counter">{{ inputLength }}/{{ maxLength }}</span>
        </div>
        <button class="chat-send" type="submit" :disabled="loading || !input.trim()">
          {{ loading ? '답변 중' : '전송' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.chat-widget {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1000;
}

.chat-fab {
  border: none;
  border-radius: 999px;
  padding: 14px 18px;
  font-weight: 800;
  font-size: 15px;
  color: #ffffff;
  background: var(--button-accent, #34447aaf);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}

.chat-fab:hover {
  background: var(--button-accent-hover, #34447a);
}

.chat-panel {
  display: flex;
  flex-direction: column;
  width: 340px;
  max-width: calc(100vw - 40px);
  height: 480px;
  max-height: calc(100vh - 40px);
  background: var(--surface, #ffffff);
  border: 1px solid var(--border-soft, #d9e1e8);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-weight: 800;
  color: #ffffff;
  background: var(--primary-green, #1f6f5b);
}

.chat-close {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 16px;
  cursor: pointer;
}

.chat-mode {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  background: var(--surface, #ffffff);
  border-bottom: 1px solid var(--border-soft, #d9e1e8);
}

.chat-mode-btn {
  flex: 1;
  border: 1px solid var(--border-soft, #d9e1e8);
  border-radius: 999px;
  padding: 5px 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #5a6678);
  background: var(--surface-tint, #f8fafb);
  cursor: pointer;
}

.chat-mode-btn.is-active {
  color: #ffffff;
  background: var(--primary-green, #1f6f5b);
  border-color: var(--primary-green, #1f6f5b);
}

.chat-mode-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface-tint, #f8fafb);
}

.chat-message {
  max-width: 85%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-message.is-user {
  align-self: flex-end;
  background: var(--button-accent, #34447aaf);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.chat-message.is-assistant {
  align-self: flex-start;
  background: var(--primary-green-soft, #e9f5f1);
  color: var(--text-strong, #1d2433);
  border-bottom-left-radius: 4px;
}

.chat-message p {
  margin: 0;
}

.chat-typing {
  opacity: 0.7;
  font-style: italic;
}

.chat-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-progress-dots {
  display: inline-flex;
  gap: 3px;
}

.chat-progress-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: chat-bounce 1.2s infinite ease-in-out;
}

.chat-progress-dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.chat-progress-dots i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes chat-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-3px); opacity: 1; }
}

.chat-notice {
  margin: 0;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-muted, #5a6678);
  background: var(--founder-pink-soft, #fff8f8);
}

.chat-notice.is-loading {
  color: var(--primary-green, #1f6f5b);
  background: var(--primary-green-soft, #e9f5f1);
}

.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border-soft, #d9e1e8);
  background: var(--surface, #ffffff);
}

.chat-input-wrap {
  position: relative;
  display: flex;
  flex: 1;
}

.chat-input {
  flex: 1;
  min-height: 38px;
  border: 1px solid var(--border-soft, #d9e1e8);
  border-radius: 7px;
  padding: 8px 48px 8px 10px;
  font: inherit;
  min-width: 0;
}

.chat-counter {
  position: absolute;
  right: 8px;
  bottom: 5px;
  font-size: 10px;
  color: var(--text-muted, #5a6678);
  pointer-events: none;
}

.chat-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(52, 68, 122, 0.22);
}

.chat-send {
  border: none;
  border-radius: 7px;
  padding: 8px 14px;
  font-weight: 800;
  color: #ffffff;
  background: var(--button-accent, #34447aaf);
  cursor: pointer;
}

.chat-send:hover:not(:disabled) {
  background: var(--button-accent-hover, #34447a);
}

.chat-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
