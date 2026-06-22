import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHousePriceRangeRequests, buildHouseSearchRequests } from './houseSearchParams.js'

const SEOUL = '\uC11C\uC6B8\uD2B9\uBCC4\uC2DC'
const DONGJAK = '\uB3D9\uC791\uAD6C'
const SANGDO = '\uC0C1\uB3C4\uB3D9'

test('specific Seoul district and deal month enables auto import for that lawdCd', () => {
  const requests = buildHouseSearchRequests({
    sido: SEOUL,
    sigungu: DONGJAK,
    umdNm: '',
    aptName: '',
    startDealMonth: '2026-05',
    endDealMonth: '2026-05',
    sort: 'latest',
    minPrice: '',
    maxPrice: '',
  }, { page: 2 })

  assert.deepEqual(requests, [{
    sido: '',
    sigungu: '',
    umdNm: '',
    aptName: '',
    dealYmd: '202605',
    startDealYmd: '',
    endDealYmd: '',
    page: '2',
    size: '10',
    autoImport: 'true',
    lawdCd: '11590',
    sort: 'latest',
    minPrice: '',
    maxPrice: '',
  }])
})

test('Seoul-wide search uses one paginated request with auto import disabled', () => {
  const requests = buildHouseSearchRequests({
    sido: SEOUL,
    sigungu: '',
    umdNm: '',
    aptName: '',
    startDealMonth: '2026-05',
    endDealMonth: '2026-05',
    sort: 'latest',
    minPrice: '',
    maxPrice: '',
  }, { page: 3 })

  assert.deepEqual(requests, [{
    sido: SEOUL,
    sigungu: '',
    umdNm: '',
    aptName: '',
    dealYmd: '202605',
    startDealYmd: '',
    endDealYmd: '',
    page: '3',
    size: '10',
    autoImport: 'false',
    lawdCd: '',
    sort: 'latest',
    minPrice: '',
    maxPrice: '',
  }])
})

test('specific Seoul district without deal month keeps auto import disabled', () => {
  const requests = buildHouseSearchRequests({
    sido: SEOUL,
    sigungu: DONGJAK,
    umdNm: '',
    aptName: '',
    startDealMonth: '',
    endDealMonth: '',
    sort: 'latest',
    minPrice: '',
    maxPrice: '',
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].lawdCd, '11590')
  assert.equal(requests[0].dealYmd, '')
  assert.equal(requests[0].autoImport, 'false')
})

test('sort and price filters are included only when selected values are valid', () => {
  const requests = buildHouseSearchRequests({
    sido: SEOUL,
    sigungu: '',
    umdNm: '',
    aptName: '',
    startDealMonth: '',
    endDealMonth: '',
    sort: 'priceDesc',
    minPrice: '100000',
    maxPrice: 250000,
  })

  assert.equal(requests[0].sort, 'priceDesc')
  assert.equal(requests[0].minPrice, '100000')
  assert.equal(requests[0].maxPrice, '250000')
})

test('sort is omitted until sido is selected', () => {
  const requests = buildHouseSearchRequests({
    sido: '',
    sigungu: '',
    umdNm: '',
    aptName: 'River',
    startDealMonth: '',
    endDealMonth: '',
    sort: 'priceAsc',
    minPrice: '',
    maxPrice: '',
  })

  assert.equal(requests[0].sort, '')
})

test('price range request omits current price filters and pagination', () => {
  const requests = buildHousePriceRangeRequests({
    sido: SEOUL,
    sigungu: DONGJAK,
    umdNm: SANGDO,
    aptName: '',
    startDealMonth: '2026-05',
    endDealMonth: '2026-05',
    sort: 'priceDesc',
    minPrice: '50000',
    maxPrice: '100000',
  })

  assert.deepEqual(requests, [{
    sido: '',
    sigungu: '',
    umdNm: SANGDO,
    aptName: '',
    dealYmd: '202605',
    startDealYmd: '',
    endDealYmd: '',
    autoImport: 'true',
    lawdCd: '11590',
  }])
})

test('deal month range sends start and end deal ymd when months differ', () => {
  const requests = buildHouseSearchRequests({
    sido: SEOUL,
    sigungu: DONGJAK,
    umdNm: '',
    aptName: '',
    startDealMonth: '2026-04',
    endDealMonth: '2026-06',
    sort: 'latest',
    minPrice: '',
    maxPrice: '',
  })

  assert.equal(requests[0].dealYmd, '')
  assert.equal(requests[0].startDealYmd, '202604')
  assert.equal(requests[0].endDealYmd, '202606')
  assert.equal(requests[0].autoImport, 'false')
})
