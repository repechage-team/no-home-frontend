<script>
import {
  buildHouseSearchRequests,
  emptyFilters,
  isSeoul,
  seoulLawdCodes,
  seoulDistricts,
} from './houseSearchParams'
import ChatWidget from './components/ChatWidget.vue'

const SEARCH_PAGE_SIZE = 10
const SEARCH_REQUEST_TIMEOUT_MS = 25000
const REGION_REQUEST_TIMEOUT_MS = 10000
const MIN_SEARCH_LOADING_MS = 600
const DEFAULT_MAP_CENTER = {
  lat: 37.566826,
  lng: 126.9786567,
}
const KAKAO_MAP_API_KEY = import.meta.env.VITE_KAKAO_MAP_API_KEY
const KAKAO_MAP_SDK_ERROR_MESSAGE = 'Kakao Map SDK 로드에 실패했습니다. Kakao Developers의 Web 플랫폼 사이트 도메인에 현재 주소를 등록해 주세요.'
let kakaoMapsSdkPromise = null

const fieldText = (value, fallback = '-') => {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  return repairMojibake(String(value))
}

const windows1252Bytes = {
  0x20AC: 0x80,
  0x201A: 0x82,
  0x0192: 0x83,
  0x201E: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02C6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8A,
  0x2039: 0x8B,
  0x0152: 0x8C,
  0x017D: 0x8E,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201C: 0x93,
  0x201D: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02DC: 0x98,
  0x2122: 0x99,
  0x0161: 0x9A,
  0x203A: 0x9B,
  0x0153: 0x9C,
  0x017E: 0x9E,
  0x0178: 0x9F,
}

const repairMojibake = (value) => {
  if (!looksLikeMojibake(value) || /[가-힣]/.test(value) || typeof TextDecoder === 'undefined') {
    return value
  }

  const bytes = []

  for (const char of value) {
    const code = char.charCodeAt(0)

    if (code <= 0xff) {
      bytes.push(code)
    } else if (windows1252Bytes[code]) {
      bytes.push(windows1252Bytes[code])
    } else {
      return value
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return value
  }
}

const looksLikeMojibake = (value) => {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if ((code >= 0x80 && code <= 0xff) || windows1252Bytes[code]) {
      return true
    }
  }

  return false
}

const loadKakaoMapsSdk = () => {
  if (!KAKAO_MAP_API_KEY) {
    return Promise.reject(new Error('VITE_KAKAO_MAP_API_KEY가 설정되지 않았습니다.'))
  }

  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저 환경에서만 지도를 사용할 수 있습니다.'))
  }

  if (window.kakao?.maps?.services) {
    return Promise.resolve(window.kakao)
  }

  if (kakaoMapsSdkPromise) {
    return kakaoMapsSdkPromise
  }

  kakaoMapsSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-kakao-map-sdk="true"]')
    const finishLoad = () => {
      if (!window.kakao?.maps) {
        reject(new Error('Kakao Map SDK를 불러오지 못했습니다.'))
        return
      }

      window.kakao.maps.load(() => resolve(window.kakao))
    }

    if (existingScript) {
      existingScript.addEventListener('load', finishLoad, { once: true })
      existingScript.addEventListener('error', () => reject(new Error(KAKAO_MAP_SDK_ERROR_MESSAGE)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.dataset.kakaoMapSdk = 'true'
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_MAP_API_KEY)}&libraries=services&autoload=false`
    script.addEventListener('load', finishLoad, { once: true })
    script.addEventListener('error', () => reject(new Error(KAKAO_MAP_SDK_ERROR_MESSAGE)), { once: true })
    document.head.appendChild(script)
  })

  return kakaoMapsSdkPromise
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = SEARCH_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (exception) {
    if (exception?.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다. 백엔드 로그 또는 공공데이터 API 응답 상태를 확인해 주세요.')
    }
    throw exception
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const waitForPaint = () => new Promise((resolve) => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resolve)
  })
})

const keepSearchLoadingVisible = async (startedAt) => {
  const remainingMs = MIN_SEARCH_LOADING_MS - (Date.now() - startedAt)
  if (remainingMs > 0) {
    await wait(remainingMs)
  }
}

export default {
  components: {
    ChatWidget,
  },
  data() {
    return {
      filters: emptyFilters(),
      items: [],
      totalCount: null,
      searchPage: 1,
      pageSize: SEARCH_PAGE_SIZE,
      selectedItem: null,
      loading: false,
      searchRequestId: 0,
      error: '',
      hasSearched: false,
      seoulDistricts,
      legalDongs: [],
      legalDongLoading: false,
      legalDongRequestId: 0,
      legalDongError: '',
      member: null,
      accountPanelOpen: false,
      accountMode: 'login',
      memberLoading: false,
      memberMessage: '',
      memberError: '',
      loginForm: {
        email: '',
        password: '',
      },
      signupForm: {
        email: '',
        password: '',
        name: '',
        phone: '',
      },
      profileForm: {
        name: '',
        phone: '',
      },
      deleteConfirm: '',
      kakao: null,
      map: null,
      markerDisplayCount: 0,
      mapLoading: false,
      mapStatus: '지도 API 키를 확인하고 있습니다.',
      mapError: '',
      mapReady: false,
    }
  },
  mounted() {
    this.mapMarkers = []
    this.mapMarkerItems = []
    this.geocodedMapItems = []
    this.loadCurrentMember()
    this.prepareMap()
  },
  computed: {
    accountSummary() {
      if (!this.member) {
        return '로그인이 필요합니다.'
      }

      return `${fieldText(this.member.name, this.member.email)} · ${this.member.email}`
    },
    visibleCountLabel() {
      if (this.loading) {
        return '조회 중'
      }

      if (!this.hasSearched) {
        return '검색 전'
      }

      if (this.totalCount !== null && this.totalCount !== undefined) {
        return `${this.totalCount.toLocaleString()}건`
      }

      return `${this.items.length.toLocaleString()}건`
    },
    mapSummary() {
      if (!this.selectedItem) {
        return '목록에서 주택을 선택하면 이 영역에 선택 요약만 표시됩니다.'
      }

      return `${this.displayAptName(this.selectedItem)} · ${this.displayAddress(this.selectedItem)}`
    },
    totalPages() {
      if (!this.totalCount) {
        return 1
      }

      return Math.max(Math.ceil(this.totalCount / this.pageSize), 1)
    },
    canGoPreviousPage() {
      return this.hasSearched && this.searchPage > 1 && !this.loading
    },
    canGoNextPage() {
      return this.hasSearched && this.searchPage < this.totalPages && !this.loading
    },
    pageSummary() {
      if (!this.hasSearched) {
        return '검색 전'
      }

      return `${this.searchPage.toLocaleString()} / ${this.totalPages.toLocaleString()} 페이지`
    },
    resultMetaLabel() {
      if (this.loading) {
        return `조회 중 · 페이지당 ${this.pageSize}개`
      }

      const count = this.totalCount ?? 0
      return `${count.toLocaleString()}건 · 페이지당 ${this.pageSize}개`
    },
    markerCountLabel() {
      if (!this.hasSearched) {
        return '검색 전'
      }

      return `${this.markerDisplayCount.toLocaleString()} / ${this.items.length.toLocaleString()}개 표시`
    },
    selectedLawdCd() {
      if (!isSeoul(this.filters.sido) || !this.filters.sigungu) {
        return ''
      }

      return seoulLawdCodes[this.filters.sigungu] || ''
    },
    legalDongDisabled() {
      return !this.selectedLawdCd || this.legalDongLoading || this.legalDongs.length === 0
    },
    mapStatusLabel() {
      if (this.mapError) {
        return this.mapError
      }

      if (this.mapLoading) {
        return '지도 처리 중'
      }

      return this.hasSearched
        ? `${this.markerCountLabel} · ${this.mapStatus}`
        : this.mapStatus
    },
  },
  methods: {
    isSeoul,
    fieldText,
    async requestMemberApi(path, options = {}) {
      const headers = {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      }
      const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'include',
      })
      const body = await response.json().catch(() => null)

      if (!response.ok || body?.success === false) {
        const error = new Error(body?.message || `요청 실패 (${response.status})`)
        error.status = response.status
        throw error
      }

      return body?.data ?? body ?? {}
    },
    async loadCurrentMember({ silent = true } = {}) {
      this.memberLoading = true
      if (!silent) {
        this.memberError = ''
        this.memberMessage = ''
      }

      try {
        const member = await this.requestMemberApi('/api/members/me')
        this.setCurrentMember(member)
      } catch (exception) {
        if (exception?.status === 401) {
          this.setCurrentMember(null)
          if (!silent) {
            this.memberMessage = '로그인 후 내 정보를 확인할 수 있습니다.'
          }
          return
        }

        if (!silent) {
          this.memberError = exception instanceof Error
            ? exception.message
            : '회원 정보를 불러오지 못했습니다.'
        }
      } finally {
        this.memberLoading = false
      }
    },
    setCurrentMember(member) {
      this.member = member
      this.profileForm = {
        name: member?.name || '',
        phone: member?.phone || '',
      }
    },
    openAccountPanel(mode = this.member ? 'profile' : 'login') {
      this.accountMode = mode
      this.accountPanelOpen = true
      this.memberMessage = ''
      this.memberError = ''
      if (mode === 'profile') {
        this.loadCurrentMember({ silent: false })
      }
    },
    closeAccountPanel() {
      this.accountPanelOpen = false
      this.memberMessage = ''
      this.memberError = ''
      this.deleteConfirm = ''
    },
    switchAccountMode(mode) {
      this.accountMode = mode
      this.memberMessage = ''
      this.memberError = ''
      this.deleteConfirm = ''
      if (mode === 'profile') {
        this.loadCurrentMember({ silent: false })
      }
    },
    async signupMember() {
      this.memberLoading = true
      this.memberError = ''
      this.memberMessage = ''

      try {
        const member = await this.requestMemberApi('/api/members', {
          method: 'POST',
          body: JSON.stringify(this.signupForm),
        })
        this.loginForm.email = member.email || this.signupForm.email
        this.loginForm.password = ''
        this.signupForm = {
          email: '',
          password: '',
          name: '',
          phone: '',
        }
        this.accountMode = 'login'
        this.memberMessage = '회원가입이 완료되었습니다. 방금 만든 계정으로 로그인해 주세요.'
      } catch (exception) {
        this.memberError = exception instanceof Error
          ? exception.message
          : '회원가입에 실패했습니다.'
      } finally {
        this.memberLoading = false
      }
    },
    async loginMember() {
      this.memberLoading = true
      this.memberError = ''
      this.memberMessage = ''

      try {
        const member = await this.requestMemberApi('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(this.loginForm),
        })
        this.setCurrentMember(member)
        this.loginForm.password = ''
        this.accountMode = 'profile'
        this.memberMessage = '로그인되었습니다.'
      } catch (exception) {
        this.memberError = exception instanceof Error
          ? exception.message
          : '로그인에 실패했습니다.'
      } finally {
        this.memberLoading = false
      }
    },
    async logoutMember() {
      this.memberLoading = true
      this.memberError = ''
      this.memberMessage = ''

      try {
        await this.requestMemberApi('/api/auth/logout', {
          method: 'POST',
        })
        this.setCurrentMember(null)
        this.accountMode = 'login'
        this.memberMessage = '로그아웃되었습니다.'
      } catch (exception) {
        this.setCurrentMember(null)
        this.accountMode = 'login'
        this.memberMessage = '로그인 상태를 정리했습니다.'
      } finally {
        this.memberLoading = false
      }
    },
    async updateMember() {
      this.memberLoading = true
      this.memberError = ''
      this.memberMessage = ''

      try {
        const member = await this.requestMemberApi('/api/members/me', {
          method: 'PUT',
          body: JSON.stringify(this.profileForm),
        })
        this.setCurrentMember(member)
        this.memberMessage = '내 정보가 수정되었습니다.'
      } catch (exception) {
        this.memberError = exception instanceof Error
          ? exception.message
          : '내 정보 수정에 실패했습니다.'
      } finally {
        this.memberLoading = false
      }
    },
    async deleteMember() {
      if (this.deleteConfirm !== '삭제') {
        this.memberError = '회원 삭제를 진행하려면 확인을 위해 삭제를 입력해 주세요.'
        return
      }

      this.memberLoading = true
      this.memberError = ''
      this.memberMessage = ''

      try {
        await this.requestMemberApi('/api/members/me', {
          method: 'DELETE',
        })
        this.setCurrentMember(null)
        this.deleteConfirm = ''
        this.accountMode = 'login'
        this.memberMessage = '회원 정보가 삭제되었습니다.'
      } catch (exception) {
        this.memberError = exception instanceof Error
          ? exception.message
          : '회원 삭제에 실패했습니다.'
      } finally {
        this.memberLoading = false
      }
    },
    async searchHouses(page = 1) {
      this.loading = false
      const startedAt = Date.now()
      const requestId = this.searchRequestId + 1
      this.searchRequestId = requestId
      this.loading = true
      this.error = ''
      this.hasSearched = true
      this.selectedItem = null
      this.items = []
      this.totalCount = null
      this.searchPage = page
      this.clearMapMarkers()
      await this.$nextTick()
      await waitForPaint()

      try {
        const requests = buildHouseSearchRequests(this.filters, {
          page: this.searchPage,
          size: this.pageSize,
        })
        const results = await Promise.all(requests.map((fields) => this.fetchHouseSearch(fields)))
        if (requestId !== this.searchRequestId) {
          return
        }
        await keepSearchLoadingVisible(startedAt)
        if (requestId !== this.searchRequestId) {
          return
        }

        this.items = results.flatMap((payload) => Array.isArray(payload.items) ? payload.items : [])
        this.totalCount = results.reduce((sum, payload) => {
          if (Number.isFinite(payload.totalCount)) {
            return sum + payload.totalCount
          }

          return sum + (Array.isArray(payload.items) ? payload.items.length : 0)
        }, 0)
        this.loading = false
        this.$nextTick(() => {
          this.refreshMapMarkers()
        })
      } catch (exception) {
        if (requestId !== this.searchRequestId) {
          return
        }
        await keepSearchLoadingVisible(startedAt)
        if (requestId !== this.searchRequestId) {
          return
        }
        this.items = []
        this.totalCount = 0
        this.error = exception instanceof Error
          ? exception.message
          : '검색 중 오류가 발생했습니다.'
        this.clearMapMarkers()
      } finally {
        if (requestId === this.searchRequestId) {
          this.loading = false
        }
      }
    },
    async fetchHouseSearch(fields) {
      const params = new URLSearchParams()

      Object.entries(fields).forEach(([key, value]) => {
        if (value) {
          params.set(key, value)
        }
      })

      const query = params.toString()
      const response = await fetchWithTimeout(`/api/houses/search${query ? `?${query}` : ''}`)
      const body = await response.json().catch(() => null)

      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || `검색 요청 실패 (${response.status})`)
      }

      return body?.data ?? body ?? {}
    },
    handleSidoChange(event) {
      this.filters.sido = event?.target?.value ?? this.filters.sido
      this.searchRequestId += 1
      this.loading = false
      this.filters.umdNm = ''
      this.legalDongs = []
      this.legalDongError = ''
      if (!isSeoul(this.filters.sido)) {
        this.filters.sigungu = ''
      }
      this.loadLegalDongs(this.selectedLawdCd)
    },
    handleSigunguChange(event) {
      this.filters.sigungu = event?.target?.value ?? this.filters.sigungu
      this.searchRequestId += 1
      this.loading = false
      this.filters.umdNm = ''
      this.legalDongs = []
      this.loadLegalDongs()
    },
    async loadLegalDongs(lawdCd = this.selectedLawdCd) {
      const requestId = this.legalDongRequestId + 1
      this.legalDongRequestId = requestId
      this.legalDongError = ''
      this.legalDongs = []

      if (!lawdCd) {
        this.legalDongLoading = false
        return
      }

      this.legalDongLoading = true
      try {
        const response = await fetchWithTimeout(
          `/api/regions?lawdCd=${encodeURIComponent(lawdCd)}`,
          {},
          REGION_REQUEST_TIMEOUT_MS
        )
        const body = await response.json().catch(() => null)
        if (requestId !== this.legalDongRequestId || lawdCd !== this.selectedLawdCd) {
          return
        }

        if (!response.ok || body?.success === false) {
          throw new Error(body?.message || `동 목록 요청 실패 (${response.status})`)
        }

        this.legalDongs = this.normalizeLegalDongs(Array.isArray(body?.data) ? body.data : [])
      } catch (exception) {
        if (requestId !== this.legalDongRequestId || lawdCd !== this.selectedLawdCd) {
          return
        }
        this.legalDongs = []
        this.legalDongError = exception instanceof Error
          ? exception.message
          : '동 목록을 불러오지 못했습니다.'
      } finally {
        if (requestId === this.legalDongRequestId) {
          this.legalDongLoading = false
        }
      }
    },
    normalizeLegalDongs(regions) {
      const dongsByLabel = new Map()

      regions.forEach((region) => {
        const rawValue = typeof region?.umdNm === 'string' ? region.umdNm.trim() : ''
        const label = fieldText(rawValue, '').trim()
        if (!rawValue || !label) {
          return
        }

        const previous = dongsByLabel.get(label)
        if (!previous || previous.value !== previous.label && rawValue === label) {
          dongsByLabel.set(label, { label, value: rawValue })
        }
      })

      return Array.from(dongsByLabel.values())
        .sort((first, second) => first.label.localeCompare(second.label, 'ko'))
    },
    resetSearch() {
      this.searchRequestId += 1
      this.legalDongRequestId += 1
      this.filters = emptyFilters()
      this.legalDongs = []
      this.legalDongLoading = false
      this.legalDongError = ''
      this.items = []
      this.totalCount = null
      this.searchPage = 1
      this.selectedItem = null
      this.loading = false
      this.error = ''
      this.hasSearched = false
      this.clearMapMarkers()
    },
    selectItem(item) {
      this.selectedItem = item
      this.$nextTick(() => {
        this.renderMapMarkers()
        this.focusMapItem(item)
      })
    },
    backToList() {
      this.selectedItem = null
    },
    searchFirstPage(event) {
      event?.preventDefault?.()
      return this.searchHouses(1)
    },
    goPreviousPage() {
      if (this.canGoPreviousPage) {
        return this.searchHouses(this.searchPage - 1)
      }
    },
    goNextPage() {
      if (this.canGoNextPage) {
        return this.searchHouses(this.searchPage + 1)
      }
    },
    displayAptName(item) {
      return fieldText(item?.aptNm, '?꾪뙆?몃챸 ?놁쓬')
    },
    displayAddress(item) {
      const dong = fieldText(item?.umdNm, '')
      const jibun = fieldText(item?.jibun, '')
      const address = [dong, jibun].filter(Boolean).join(' ')
      return address || '-'
    },
    displayDealAmount(item) {
      const amount = fieldText(item?.dealAmount, '-')
      return amount === '-' ? amount : `${amount}만`
    },
    displayArea(item) {
      return item?.excluUseAr ? `${item.excluUseAr}㎡` : '-'
    },
    displayFloor(item) {
      return item?.floor || item?.floor === 0 ? `${item.floor}층` : '-'
    },
    displayDealDate(item) {
      if (item?.dealDate) {
        return item.dealDate
      }

      if (item?.dealYmd && item.dealYmd.length === 6) {
        return `${item.dealYmd.slice(0, 4)}-${item.dealYmd.slice(4, 6)}`
      }

      return '-'
    },
    displayBuildYear(item) {
      return item?.buildYear ? `${item.buildYear}년식` : '-'
    },
    displayRegion(item) {
      const sido = fieldText(item?.sido, '')
      const sigungu = fieldText(item?.sigungu, '')
      return [sido, sigungu].filter(Boolean).join(' ') || '-'
    },
    displayCoordinateState(item) {
      if (item?.lat && item?.lng) {
        return `${item.lat}, ${item.lng}`
      }

      return '주소 기반 검색'
    },
    itemKey(item) {
      return item?.dealId ?? `${item?.houseId ?? 'house'}-${item?.dealDate ?? 'date'}-${item?.floor ?? 'floor'}`
    },
    mapAddress(item) {
      return [
        fieldText(item?.sido, ''),
        fieldText(item?.sigungu, ''),
        fieldText(item?.umdNm, ''),
        fieldText(item?.jibun, ''),
      ].filter(Boolean).join(' ')
    },
    async prepareMap() {
      this.mapLoading = true
      this.mapError = ''

      try {
        const kakao = await loadKakaoMapsSdk()
        this.kakao = kakao
        this.mapReady = true
        this.mapStatus = '검색 결과가 지도에 표시됩니다.'
        this.$nextTick(() => {
          this.ensureMap()
          this.refreshMapMarkers()
        })
      } catch (exception) {
        this.mapReady = false
        this.mapError = exception instanceof Error
          ? exception.message
          : 'Kakao Map을 불러오지 못했습니다.'
        this.mapStatus = '지도 설정이 필요합니다.'
      } finally {
        this.mapLoading = false
      }
    },
    ensureMap(force = false) {
      if (!this.kakao || !this.$refs.mapCanvas) {
        return
      }

      if (force || !this.map || !this.$refs.mapCanvas.children.length) {
        this.$refs.mapCanvas.innerHTML = ''
        this.map = null
      }

      if (this.map) {
        return
      }

      const center = new this.kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng)
      this.map = new this.kakao.maps.Map(this.$refs.mapCanvas, {
        center,
        level: 6,
      })
      this.relayoutMap()
    },
    relayoutMap() {
      if (this.map && typeof this.map.relayout === 'function') {
        this.map.relayout()
      }
    },
    clearMapMarkers() {
      this.mapMarkers.forEach((marker) => marker.setMap(null))
      this.mapMarkers = []
      this.mapMarkerItems = []
      this.geocodedMapItems = []
      this.markerDisplayCount = 0
      if (this.hasSearched && this.mapReady) {
        this.mapStatus = '현재 페이지에서 표시할 마커가 없습니다.'
      }
    },
    async refreshMapMarkers() {
      this.clearMapMarkers()

      if (!this.items.length) {
        return
      }

      if (!this.mapReady || !this.kakao) {
        if (!KAKAO_MAP_API_KEY) {
          this.mapStatus = 'VITE_KAKAO_MAP_API_KEY 설정 후 지도를 사용할 수 있습니다.'
        }
        return
      }

      this.mapLoading = true
      this.mapError = ''
      this.mapStatus = '현재 페이지 주소를 좌표로 변환하고 있습니다.'

      try {
        const geocoder = new this.kakao.maps.services.Geocoder()
        const geocodedItems = await Promise.all(this.items.map((item) => this.geocodeItem(geocoder, item)))
        const successfulItems = geocodedItems.filter(Boolean)

        this.geocodedMapItems = successfulItems
        this.markerDisplayCount = successfulItems.length
        this.mapStatus = successfulItems.length
          ? `현재 페이지 ${successfulItems.length}개 주소를 지도에 표시했습니다.`
          : '현재 페이지 주소를 지도에서 찾지 못했습니다.'
        this.mapLoading = false
        await this.$nextTick()
        this.renderMapMarkers(successfulItems)
      } catch (exception) {
        this.mapError = exception instanceof Error
          ? exception.message
          : '지도 마커 표시 중 오류가 발생했습니다.'
        this.mapLoading = false
      }
    },
    renderMapMarkers(successfulItems = this.geocodedMapItems) {
      if (!this.mapReady || !this.kakao || !this.$refs.mapCanvas) {
        return
      }

      this.mapMarkers.forEach((marker) => marker.setMap(null))
      this.mapMarkers = []
      this.mapMarkerItems = []
      this.ensureMap(true)
      if (!this.map) {
        return
      }

      const bounds = new this.kakao.maps.LatLngBounds()
      successfulItems.forEach(({ item, position }) => {
        const marker = new this.kakao.maps.Marker({
          map: this.map,
          position,
        })
        this.kakao.maps.event.addListener(marker, 'click', () => {
          this.selectItem(item)
        })
        bounds.extend(position)
        this.mapMarkers.push(marker)
        this.mapMarkerItems.push(item)
      })

      if (this.mapMarkers.length > 1) {
        this.relayoutMap()
        this.map.setBounds(bounds)
      } else if (this.mapMarkers.length === 1) {
        this.relayoutMap()
        this.map.setCenter(this.mapMarkers[0].getPosition())
        this.map.setLevel(4)
      } else {
        this.relayoutMap()
      }
    },
    geocodeItem(geocoder, item) {
      const address = this.mapAddress(item)
      if (!address) {
        return Promise.resolve(null)
      }

      return new Promise((resolve) => {
        geocoder.addressSearch(address, (result, status) => {
          if (status !== this.kakao.maps.services.Status.OK || !result?.[0]) {
            resolve(null)
            return
          }

          resolve({
            item,
            position: new this.kakao.maps.LatLng(Number(result[0].y), Number(result[0].x)),
          })
        })
      })
    },
    focusMapItem(item) {
      if (!this.map || !this.kakao) {
        return
      }

      const index = this.mapMarkerItems.findIndex((markerItem) => this.itemKey(markerItem) === this.itemKey(item))
      if (index < 0) {
        return
      }

      const marker = this.mapMarkers[index]
      this.map.setCenter(marker.getPosition())
      this.map.setLevel(Math.min(this.map.getLevel(), 4))
    },
  },
}
</script>

<template>
  <div class="app-shell">
    <header class="top-bar">
      <div class="brand">
        <button class="brand-mark" type="button" aria-label="검색 초기화" @click="resetSearch">
          <img src="/nohome-logo.png" alt="" />
        </button>
        <div>
          <p class="app-kicker">SSAFY Home</p>
          <h1>NoHome 실거래가 검색</h1>
        </div>
      </div>
      <div class="account-actions" aria-label="회원 메뉴">
        <span class="account-summary">{{ accountSummary }}</span>
        <template v-if="member">
          <button class="account-button" type="button" @click="openAccountPanel('profile')">내 정보</button>
          <button class="secondary-button compact-button" type="button" :disabled="memberLoading" @click="logoutMember">로그아웃</button>
        </template>
        <template v-else>
          <button class="account-button" type="button" @click="openAccountPanel('login')">로그인</button>
          <button class="secondary-button compact-button" type="button" @click="openAccountPanel('signup')">회원가입</button>
        </template>
      </div>
    </header>

    <section v-if="accountPanelOpen" class="account-panel" aria-label="회원 관리">
      <div class="account-panel-header">
        <div>
          <p class="section-kicker">Account</p>
          <h2>회원 관리</h2>
        </div>
        <button class="back-button compact-button" type="button" @click="closeAccountPanel">닫기</button>
      </div>

      <div v-if="!member" class="account-tabs" role="tablist" aria-label="인증 선택">
        <button class="secondary-button compact-button" type="button" :class="{ 'is-active': accountMode === 'login' }" @click="switchAccountMode('login')">로그인</button>
        <button class="secondary-button compact-button" type="button" :class="{ 'is-active': accountMode === 'signup' }" @click="switchAccountMode('signup')">회원가입</button>
      </div>

      <p v-if="memberMessage" class="account-message">{{ memberMessage }}</p>
      <p v-if="memberError" class="account-message is-error">{{ memberError }}</p>

      <form v-if="accountMode === 'login' && !member" class="account-form" @submit.prevent="loginMember">
        <label><span>이메일</span><input v-model.trim="loginForm.email" type="email" autocomplete="email" required /></label>
        <label><span>비밀번호</span><input v-model="loginForm.password" type="password" autocomplete="current-password" required /></label>
        <div class="actions">
          <button class="primary-button" type="submit" :disabled="memberLoading">로그인</button>
          <button class="secondary-button" type="button" @click="switchAccountMode('signup')">회원가입으로</button>
        </div>
      </form>

      <form v-else-if="accountMode === 'signup' && !member" class="account-form" @submit.prevent="signupMember">
        <label><span>이메일</span><input v-model.trim="signupForm.email" type="email" autocomplete="email" required /></label>
        <label><span>비밀번호</span><input v-model="signupForm.password" type="password" autocomplete="new-password" required /></label>
        <label><span>이름</span><input v-model.trim="signupForm.name" type="text" autocomplete="name" required /></label>
        <label><span>전화번호</span><input v-model.trim="signupForm.phone" type="tel" autocomplete="tel" /></label>
        <div class="actions">
          <button class="primary-button" type="submit" :disabled="memberLoading">회원가입</button>
          <button class="secondary-button" type="button" @click="switchAccountMode('login')">로그인으로</button>
        </div>
      </form>

      <div v-else-if="member" class="profile-layout">
        <dl class="detail-list">
          <div><dt>이메일</dt><dd>{{ member.email }}</dd></div>
          <div><dt>이름</dt><dd>{{ member.name }}</dd></div>
          <div><dt>전화번호</dt><dd>{{ member.phone || '-' }}</dd></div>
        </dl>
        <form class="account-form" @submit.prevent="updateMember">
          <label><span>이름</span><input v-model.trim="profileForm.name" type="text" required /></label>
          <label><span>전화번호</span><input v-model.trim="profileForm.phone" type="tel" /></label>
          <div class="actions">
            <button class="primary-button" type="submit" :disabled="memberLoading">수정</button>
            <button class="secondary-button" type="button" :disabled="memberLoading" @click="logoutMember">로그아웃</button>
          </div>
        </form>
        <div class="danger-zone">
          <strong>회원 탈퇴</strong>
          <p>삭제하면 현재 계정이 물리 삭제되고 세션이 종료됩니다.</p>
          <label><span>확인 문구</span><input v-model="deleteConfirm" type="text" placeholder="삭제" /></label>
          <button class="danger-button" type="button" :disabled="memberLoading" @click="deleteMember">회원 삭제</button>
        </div>
      </div>
    </section>

    <main class="workspace" aria-label="주택 실거래가 검색 화면">
      <section class="left-panel" aria-label="검색과 결과">
        <form class="search-panel" novalidate @submit.prevent="searchFirstPage">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Search</p>
              <h2>주택 검색</h2>
            </div>
            <span class="result-count">{{ visibleCountLabel }}</span>
          </div>

          <div class="field-grid">
            <label><span>시도</span><select v-model="filters.sido" name="sido" @change="handleSidoChange"><option value="">전체/선택 안 함</option><option value="서울특별시">서울특별시</option></select></label>
            <label><span>시군구</span><select v-model="filters.sigungu" name="sigungu" :disabled="!isSeoul(filters.sido)" @change="handleSigunguChange"><option value="">서울 전체</option><option v-for="district in seoulDistricts" :key="district" :value="district">{{ district }}</option></select></label>
            <label><span>읍면동</span><select :key="selectedLawdCd || 'no-lawd'" v-model="filters.umdNm" name="umdNm" :disabled="legalDongDisabled"><option value="">{{ legalDongLoading ? '동 목록 불러오는 중' : '전체 동' }}</option><option v-for="dong in legalDongs" :key="dong.value" :value="dong.value">{{ dong.label }}</option></select></label>
            <label><span>아파트명</span><input v-model.trim="filters.aptName" name="aptName" type="text" autocomplete="off" placeholder="래미안" /></label>
            <label><span>거래월</span><input v-model="filters.dealMonth" name="dealMonth" type="month" /></label>
          </div>
          <p v-if="legalDongError" class="inline-error">{{ legalDongError }}</p>

          <div class="actions">
            <button class="primary-button" :class="{ 'is-loading': loading }" type="button" :aria-busy="loading ? 'true' : 'false'" @click="searchFirstPage">
              <span v-if="loading" class="button-spinner" aria-hidden="true"></span>
              <span>{{ loading ? '조회중' : '검색' }}</span>
            </button>
            <button class="secondary-button" type="button" @click="resetSearch">초기화</button>
          </div>
        </form>

        <div class="list-panel" aria-live="polite">
          <div v-if="hasSearched" class="pagination-bar">
            <div><strong>{{ pageSummary }}</strong><span>{{ resultMetaLabel }}</span></div>
            <div class="pagination-actions">
              <button class="secondary-button compact-button" type="button" :disabled="!canGoPreviousPage" @click="goPreviousPage">이전</button>
              <button class="secondary-button compact-button" type="button" :disabled="!canGoNextPage" @click="goNextPage">다음</button>
            </div>
          </div>
          <div v-if="hasSearched || mapReady || mapError" class="map-status-strip" :class="{ 'is-error': mapError }">
            <span>지도</span>
            <strong>{{ mapStatusLabel }}</strong>
          </div>

          <div v-if="loading && items.length === 0" class="state-box loading-state"><strong>검색 중입니다.</strong><span>조건에 맞는 실거래가 목록을 불러오고 있습니다.</span><span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
          <div v-else-if="error" class="state-box danger-state"><strong>검색에 실패했습니다.</strong><span>{{ error }}</span></div>
          <div v-else-if="hasSearched && items.length === 0" class="state-box"><strong>검색 결과가 없습니다.</strong><span>지역명, 아파트명, 거래월 조건을 조정해 다시 검색해 주세요.</span></div>
          <div v-else-if="!hasSearched" class="state-box"><strong>검색 조건을 입력해 주세요.</strong><span>백엔드가 실행 중이 아니어도 화면 구조는 유지됩니다.</span></div>

          <ul v-else class="result-list">
            <li v-for="item in items" :key="itemKey(item)">
              <button type="button" class="result-card" :class="{ 'is-selected': selectedItem && itemKey(selectedItem) === itemKey(item) }" @click="selectItem(item)">
                <span class="item-card-header">
                  <span class="item-title">{{ displayAptName(item) }}</span>
                  <strong class="item-price">{{ displayDealAmount(item) }}</strong>
                </span>
                <span class="item-address">{{ displayRegion(item) }} {{ displayAddress(item) }}</span>
                <span class="item-date">{{ displayDealDate(item) }}</span>
                <span class="item-meta-grid">
                  <span>{{ displayArea(item) }}</span>
                  <span>{{ displayFloor(item) }}</span>
                  <span>{{ displayBuildYear(item) }}</span>
                  <span>{{ fieldText(item?.umdNm) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </section>

      <aside class="map-panel" aria-label="지도 영역">
        <div class="map-surface">
          <div ref="mapCanvas" v-once class="map-canvas" aria-label="Kakao 지도"></div>
          <div v-if="!mapReady" class="map-grid" aria-hidden="true"></div>
        </div>
      </aside>
    </main>

    <ChatWidget :logged-in="!!member" />
  </div>
</template>
