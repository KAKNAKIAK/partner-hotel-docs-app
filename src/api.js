import { supabaseFetch } from './supabaseClient.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const browserReservationKey = 'partner-hotel-docs-last-reservation';

function partnerFromRow(item) {
  return {
    id: item.id,
    name: item.name || '',
    ciUrl: item.ci_url || '',
    recipientName: item.name || '',
    senderName: '',
    bankAccount: '',
    invoiceRemark: '',
    paymentTerms: '',
  };
}

function hotelFromRow(item) {
  return {
    id: item.id,
    name: item.name || '',
    koreanName: item.korean_name || '',
    country: item.country || '',
    city: item.city || '',
    logoUrl: item.logo_url || '',
    address: item.address || '',
    phone: item.phone || '',
    defaultNotice: item.default_notice || '',
    defaultMealPlan: item.default_meal_plan || '',
    defaultCheckInTime: item.default_check_in_time || '',
    defaultCheckOutTime: item.default_check_out_time || '',
    rooms: Array.isArray(item.rooms) ? item.rooms : [],
  };
}

function hotelPayload(hotel) {
  return {
    name: hotel.name,
    korean_name: hotel.koreanName || null,
    country: hotel.country || null,
    city: hotel.city || null,
    logo_url: hotel.logoUrl || null,
    address: hotel.address || null,
    phone: hotel.phone || null,
    default_notice: hotel.defaultNotice || null,
    default_meal_plan: hotel.defaultMealPlan || null,
    default_check_in_time: hotel.defaultCheckInTime || null,
    default_check_out_time: hotel.defaultCheckOutTime || null,
    rooms: hotel.rooms || [],
  };
}

function countryFromRow(item) {
  return {
    id: item.id,
    name: item.name || '',
  };
}

function regionFromRow(item) {
  return {
    id: item.id,
    countryId: item.country_id,
    countryName: item.country_name || '',
    name: item.name || '',
  };
}

function companyInfoFromRow(item = {}) {
  return {
    id: item.id || 'default',
    name: item.name || '',
    ciUrl: item.ci_url || '',
    address: item.address || '',
    phone: item.phone || '',
    email: item.email || '',
    bankAccount: item.bank_account || '',
    sealUrl: item.seal_url || '',
  };
}

function companyInfoToRow(companyInfo) {
  return {
    id: companyInfo.id || 'default',
    name: companyInfo.name || null,
    ci_url: companyInfo.ciUrl || null,
    address: companyInfo.address || null,
    phone: companyInfo.phone || null,
    email: companyInfo.email || null,
    bank_account: companyInfo.bankAccount || null,
    seal_url: companyInfo.sealUrl || null,
    updated_at: new Date().toISOString(),
  };
}

function phraseFromRow(item = {}) {
  return {
    id: item.id,
    title: item.title || '',
    content: item.content || '',
  };
}

function phraseToRow(phrase) {
  return {
    id: phrase.id,
    title: phrase.title || null,
    content: phrase.content || null,
    updated_at: new Date().toISOString(),
  };
}

function exchangeRateFromRow(item = {}) {
  return {
    id: item.id,
    currency: item.currency || 'USD',
    rate: Number(item.exchange_rate || 0),
    exchangeDate: item.exchange_date || '',
    savedAt: item.created_at || '',
  };
}

export async function listCompanyInfos() {
  const data = await supabaseFetch('company_settings?select=*&order=name.asc');
  return data.map(companyInfoFromRow);
}

export async function searchCompanyInfos(query = '') {
  if (!query.trim()) return listCompanyInfos();
  const params = new URLSearchParams({
    select: '*',
    name: `ilike.*${query}*`,
    order: 'name.asc',
    limit: '8',
  });
  const data = await supabaseFetch(`company_settings?${params.toString()}`);
  return data.map(companyInfoFromRow);
}

export async function createCompanyInfo(companyInfo) {
  const payload = companyInfoToRow(companyInfo);
  const data = await supabaseFetch('company_settings?select=*', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return companyInfoFromRow(data[0]);
}

export async function updateCompanyInfo(companyInfo) {
  const data = await supabaseFetch(`company_settings?id=eq.${companyInfo.id}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(companyInfoToRow(companyInfo)),
  });
  return companyInfoFromRow(data[0]);
}

export async function deleteCompanyInfo(id) {
  await supabaseFetch(`company_settings?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return id;
}

export async function listPhraseSnippets() {
  const data = await supabaseFetch('phrase_snippets?select=*&order=title.asc');
  return data.map(phraseFromRow);
}

export async function createPhraseSnippet(phrase) {
  const data = await supabaseFetch('phrase_snippets?select=*', {
    method: 'POST',
    body: JSON.stringify(phraseToRow(phrase)),
  });
  return phraseFromRow(data[0]);
}

export async function updatePhraseSnippet(phrase) {
  const data = await supabaseFetch(`phrase_snippets?id=eq.${phrase.id}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(phraseToRow(phrase)),
  });
  return phraseFromRow(data[0]);
}

export async function deletePhraseSnippet(id) {
  await supabaseFetch(`phrase_snippets?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return id;
}

export async function listExchangeRates() {
  const data = await supabaseFetch('exchange_rates?select=*&order=exchange_date.desc,created_at.asc');
  return data.map(exchangeRateFromRow);
}

export async function listExchangeRatesByDate(exchangeDate, currency = 'USD') {
  const params = new URLSearchParams({
    select: '*',
    exchange_date: `eq.${exchangeDate}`,
    currency: `eq.${currency || 'USD'}`,
    order: 'created_at.asc',
  });
  const data = await supabaseFetch(`exchange_rates?${params.toString()}`);
  return data.map(exchangeRateFromRow);
}

export async function loadLatestExchangeRate(currency = 'USD') {
  const params = new URLSearchParams({
    select: '*',
    currency: `eq.${currency || 'USD'}`,
    order: 'exchange_date.desc,created_at.desc',
    limit: '1',
  });
  const data = await supabaseFetch(`exchange_rates?${params.toString()}`);
  if (!data.length) return null;
  return exchangeRateFromRow(data[0]);
}

export async function createExchangeRate(exchangeRate) {
  const data = await supabaseFetch('exchange_rates?select=*', {
    method: 'POST',
    body: JSON.stringify({
      currency: exchangeRate.currency || 'USD',
      exchange_rate: Number(exchangeRate.rate || 0),
      exchange_date: exchangeRate.exchangeDate,
    }),
  });
  return exchangeRateFromRow(data[0]);
}

export async function listCountries() {
  const data = await supabaseFetch('countries?select=*&order=name.asc');
  return data.map(countryFromRow);
}

export async function createCountry(name) {
  const data = await supabaseFetch('countries?select=*', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return countryFromRow(data[0]);
}

export async function updateCountry(country) {
  const data = await supabaseFetch(`countries?id=eq.${country.id}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: country.name,
      updated_at: new Date().toISOString(),
    }),
  });
  return countryFromRow(data[0]);
}

export async function deleteCountry(id) {
  await supabaseFetch(`countries?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return id;
}

export async function listRegions() {
  const data = await supabaseFetch('regions?select=*,countries(name)&order=name.asc');
  return data.map((item) => regionFromRow({
    ...item,
    country_name: item.countries?.name || '',
  }));
}

export async function createRegion(countryId, name) {
  const data = await supabaseFetch('regions?select=*,countries(name)', {
    method: 'POST',
    body: JSON.stringify({ country_id: countryId, name }),
  });
  return regionFromRow({
    ...data[0],
    country_name: data[0]?.countries?.name || '',
  });
}

export async function updateRegion(region) {
  const data = await supabaseFetch(`regions?id=eq.${region.id}&select=*,countries(name)`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: region.name,
      updated_at: new Date().toISOString(),
    }),
  });
  return regionFromRow({
    ...data[0],
    country_name: data[0]?.countries?.name || '',
  });
}

export async function deleteRegion(id) {
  await supabaseFetch(`regions?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return id;
}

export async function listPartners() {
  const data = await supabaseFetch('partners?select=*&order=name.asc');
  return data.map(partnerFromRow);
}

export async function searchPartners(query = '') {
  const params = new URLSearchParams({
    select: '*',
    name: `ilike.*${query}*`,
    order: 'name.asc',
    limit: '8',
  });
  const data = await supabaseFetch(`partners?${params.toString()}`);
  return data.map(partnerFromRow);
}

export async function getPartnerById(id) {
  if (!id) return null;
  const data = await supabaseFetch(`partners?id=eq.${id}&select=*`);
  return data[0] ? partnerFromRow(data[0]) : null;
}

export async function createPartner(partner) {
  const data = await supabaseFetch('partners?select=*', {
    method: 'POST',
    body: JSON.stringify({
      name: partner.name,
      ci_url: partner.ciUrl || null,
    }),
  });
  return partnerFromRow(data[0]);
}

export async function updatePartner(partner) {
  const data = await supabaseFetch(`partners?id=eq.${partner.id}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: partner.name,
      ci_url: partner.ciUrl || null,
      updated_at: new Date().toISOString(),
    }),
  });
  return partnerFromRow(data[0]);
}

export async function deletePartner(id) {
  await supabaseFetch(`partners?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return id;
}

export async function listHotels() {
  const data = await supabaseFetch('hotels?select=*&order=country.asc,city.asc,korean_name.asc,name.asc');
  return data.map(hotelFromRow);
}

export async function searchHotels(query = '') {
  const params = new URLSearchParams({
    select: '*',
    name: `ilike.*${query}*`,
    order: 'name.asc',
    limit: '8',
  });
  const data = await supabaseFetch(`hotels?${params.toString()}`);
  return data.map(hotelFromRow);
}

export async function getHotelById(id) {
  if (!id) return null;
  const data = await supabaseFetch(`hotels?id=eq.${id}&select=*`);
  return data[0] ? hotelFromRow(data[0]) : null;
}

export async function createHotel(hotel) {
  const data = await supabaseFetch('hotels?select=*', {
    method: 'POST',
    body: JSON.stringify(hotelPayload(hotel)),
  });
  return hotelFromRow(data[0]);
}

export async function updateHotel(hotel) {
  const data = await supabaseFetch(`hotels?id=eq.${hotel.id}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...hotelPayload(hotel),
      updated_at: new Date().toISOString(),
    }),
  });
  return hotelFromRow(data[0]);
}

export async function deleteHotel(id) {
  await supabaseFetch(`hotels?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  return id;
}

export async function saveReservation(reservation) {
  const partnerId = uuidPattern.test(reservation.partnerId || '') ? reservation.partnerId : null;
  const hotelId = uuidPattern.test(reservation.hotelId || '') ? reservation.hotelId : null;

  const payload = {
    partner_id: partnerId,
    hotel_id: hotelId,
    status: reservation.status,
    lead_guest: reservation.leadGuest,
    confirm_no: reservation.confirmNo,
    issue_date: reservation.issueDate || null,
    check_in: reservation.checkIn || null,
    check_out: reservation.checkOut || null,
    stated_nights: Number(reservation.statedNights || 0),
    room_type: reservation.roomType,
    room_count: Number(reservation.roomCount || 0),
    adult_count: Number(reservation.adultCount || 0),
    child_count: Number(reservation.childCount || 0),
    infant_count: Number(reservation.infantCount || 0),
    late_checkout: reservation.lateCheckout,
    meal_plan: reservation.mealPlan,
    payment_terms: reservation.paymentTerms,
    currency: reservation.currency,
    exchange_rate: Number(reservation.exchangeRate || 0),
    exchange_rate_date: reservation.exchangeRateDate || null,
    rounding: reservation.rounding,
    bank_account: reservation.bankAccount,
    invoice_remark: reservation.invoiceRemark,
    customer_notice: reservation.customerNotice,
    charges: reservation.charges,
    snapshot: reservation,
    updated_at: new Date().toISOString(),
  };

  const data = reservation.id && uuidPattern.test(reservation.id)
    ? await supabaseFetch(`reservations?id=eq.${reservation.id}&select=*`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    : await supabaseFetch('reservations?select=*', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

  return { ...reservation, id: data?.[0]?.id || reservation.id };
}

export async function loadLatestReservation() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const item = JSON.parse(localStorage.getItem(browserReservationKey) || 'null');
    return item?.reservation || null;
  } catch {
    return null;
  }
}
