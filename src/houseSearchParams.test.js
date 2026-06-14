import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHouseSearchRequests } from './houseSearchParams.js'

test('specific Seoul district and deal month enables auto import for that lawdCd', () => {
  const requests = buildHouseSearchRequests({
    sido: '서울특별시',
    sigungu: '동작구',
    umdNm: '',
    aptName: '',
    dealMonth: '2026-05',
  }, { page: 2 })

  assert.deepEqual(requests, [{
    sido: '',
    sigungu: '',
    umdNm: '',
    aptName: '',
    dealYmd: '202605',
    page: '2',
    size: '10',
    autoImport: 'true',
    lawdCd: '11590',
  }])
})

test('Seoul-wide search uses one paginated request with auto import disabled', () => {
  const requests = buildHouseSearchRequests({
    sido: '서울특별시',
    sigungu: '',
    umdNm: '',
    aptName: '',
    dealMonth: '2026-05',
  }, { page: 3 })

  assert.deepEqual(requests, [{
    sido: '서울특별시',
    sigungu: '',
    umdNm: '',
    aptName: '',
    dealYmd: '202605',
    page: '3',
    size: '10',
    autoImport: 'false',
    lawdCd: '',
  }])
})

test('specific Seoul district without deal month keeps auto import disabled', () => {
  const requests = buildHouseSearchRequests({
    sido: '서울특별시',
    sigungu: '동작구',
    umdNm: '',
    aptName: '',
    dealMonth: '',
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].lawdCd, '11590')
  assert.equal(requests[0].dealYmd, '')
  assert.equal(requests[0].autoImport, 'false')
})
