export const emptyFilters = () => ({
  sido: '',
  sigungu: '',
  umdNm: '',
  aptName: '',
  startDealMonth: '',
  endDealMonth: '',
  sort: 'latest',
  minPrice: '',
  maxPrice: '',
})

export const seoulLawdCodes = {
  종로구: '11110',
  중구: '11140',
  용산구: '11170',
  성동구: '11200',
  광진구: '11215',
  동대문구: '11230',
  중랑구: '11260',
  성북구: '11290',
  강북구: '11305',
  도봉구: '11320',
  노원구: '11350',
  은평구: '11380',
  서대문구: '11410',
  마포구: '11440',
  양천구: '11470',
  강서구: '11500',
  구로구: '11530',
  금천구: '11545',
  영등포구: '11560',
  동작구: '11590',
  관악구: '11620',
  서초구: '11650',
  강남구: '11680',
  송파구: '11710',
  강동구: '11740',
}

export const seoulDistricts = Object.keys(seoulLawdCodes)

export const normalizeDealYmd = (filters) => {
  if (filters.dealMonth) {
    return filters.dealMonth.replace('-', '')
  }

  if (filters.startDealMonth && filters.endDealMonth && filters.startDealMonth === filters.endDealMonth) {
    return filters.startDealMonth.replace('-', '')
  }

  return ''
}

export const normalizeDealYmdRange = (filters) => {
  const dealYmd = normalizeDealYmd(filters)
  if (dealYmd) {
    return { dealYmd, startDealYmd: '', endDealYmd: '' }
  }

  return {
    dealYmd: '',
    startDealYmd: filters.startDealMonth ? filters.startDealMonth.replace('-', '') : '',
    endDealYmd: filters.endDealMonth ? filters.endDealMonth.replace('-', '') : '',
  }
}

const normalizeRegionName = (value) => value.trim().replace(/\s/g, '')

export const isSeoul = (value) => {
  const sido = normalizeRegionName(value)
  return sido === '서울특별시' || sido === '서울시' || sido === '서울'
}

export const resolveLawdCds = (filters) => {
  const sido = normalizeRegionName(filters.sido)
  const sigungu = normalizeRegionName(filters.sigungu)

  if (!isSeoul(sido)) {
    return []
  }

  if (seoulLawdCodes[sigungu]) {
    return [seoulLawdCodes[sigungu]]
  }

  return seoulDistricts.map((district) => seoulLawdCodes[district])
}

export const buildHouseSearchRequests = (filters, options = {}) => {
  return [buildHouseSearchFields(filters, options)]
}

export const buildHousePriceRangeRequests = (filters) => {
  const fields = buildHouseSearchFields(filters)
  delete fields.page
  delete fields.size
  delete fields.sort
  delete fields.minPrice
  delete fields.maxPrice
  return [fields]
}

const buildHouseSearchFields = (filters, options = {}) => {
  const { dealYmd, startDealYmd, endDealYmd } = normalizeDealYmdRange(filters)
  const lawdCds = resolveLawdCds(filters)
  const page = Math.max(Number(options.page || 1), 1)
  const size = Math.max(Number(options.size || 10), 1)
  const selectedDistrictLawdCd = filters.sigungu && lawdCds.length === 1 ? lawdCds[0] : ''
  const shouldAutoImport = Boolean(selectedDistrictLawdCd)
    && Boolean(filters.sigungu)
    && Boolean(dealYmd)

  return {
    sido: selectedDistrictLawdCd ? '' : filters.sido.trim(),
    sigungu: selectedDistrictLawdCd ? '' : filters.sigungu.trim(),
    umdNm: filters.umdNm.trim(),
    aptName: filters.aptName.trim(),
    dealYmd,
    startDealYmd,
    endDealYmd,
    page: String(page),
    size: String(size),
    autoImport: shouldAutoImport ? 'true' : 'false',
    lawdCd: selectedDistrictLawdCd,
    sort: filters.sido?.trim() ? (filters.sort || 'latest') : '',
    minPrice: normalizePriceFilter(filters.minPrice),
    maxPrice: normalizePriceFilter(filters.maxPrice),
  }
}

const normalizePriceFilter = (value) => {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return ''
  }

  return String(Math.trunc(numeric))
}
