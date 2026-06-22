import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAgentFilters,
  buildHouseSearchRequests,
  capabilities,
  emptyFilters,
  filterSchema,
} from './houseSearchParams.js'

test('capabilities() returns exactly the declared filter keys', () => {
  assert.deepEqual(capabilities(), [
    'sido',
    'sigungu',
    'umdNm',
    'aptName',
    'startDealMonth',
    'endDealMonth',
    'sort',
    'minPrice',
    'maxPrice',
  ])
  // capabilities는 filterSchema 키와 항상 동일(단일 출처).
  assert.deepEqual(capabilities(), Object.keys(filterSchema))
})

test('applyAgentFilters applies recognized keys and reports them', () => {
  const filters = emptyFilters()
  const { applied, ignored } = applyAgentFilters(filters, {
    sigungu: '강남구',
    startDealMonth: '2024-05',
  })

  assert.equal(filters.sigungu, '강남구')
  assert.equal(filters.startDealMonth, '2024-05')
  assert.deepEqual(applied, { sigungu: '강남구', startDealMonth: '2024-05' })
  assert.deepEqual(ignored, [])
})

test('applyAgentFilters ignores unknown keys without mutating them', () => {
  const filters = emptyFilters()
  const { applied, ignored } = applyAgentFilters(filters, {
    sigungu: '마포구',
    bedrooms: '3',
    foo: 'bar',
  })

  assert.equal(filters.sigungu, '마포구')
  assert.equal('bedrooms' in filters, false)
  assert.equal('foo' in filters, false)
  assert.deepEqual(applied, { sigungu: '마포구' })
  assert.deepEqual(ignored, ['bedrooms', 'foo'])
})

test('applied filters feed the existing search request builder (round-trip)', () => {
  const filters = emptyFilters()
  applyAgentFilters(filters, {
    sido: '서울특별시',
    sigungu: '강남구',
    startDealMonth: '2024-05',
    endDealMonth: '2024-05',
  })

  const [request] = buildHouseSearchRequests(filters, { page: 1 })

  assert.equal(request.lawdCd, '11680') // 강남구
  assert.equal(request.dealYmd, '202405')
  assert.equal(request.autoImport, 'true')
})
