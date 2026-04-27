import { hotels as mockHotels, partners as mockPartners } from './data.js';
import { hasSupabaseConfig, supabaseFetch } from './supabaseClient.js';

function includesQuery(value, query) {
  return String(value || '').toLowerCase().includes(String(query || '').trim().toLowerCase());
}

export async function searchPartners(query = '') {
  if (!hasSupabaseConfig) {
    return mockPartners.filter((partner) => includesQuery(partner.name, query)).slice(0, 8);
  }

  const params = new URLSearchParams({
    select: '*',
    name: `ilike.*${query}*`,
    order: 'name.asc',
    limit: '8',
  });
  const data = await supabaseFetch(`partners?${params.toString()}`);
  return data.map((item) => ({
    id: item.id,
    name: item.name,
    recipientName: item.recipient_name,
    senderName: item.sender_name,
    bankAccount: item.bank_account,
    invoiceRemark: item.invoice_remark,
    paymentTerms: item.payment_terms,
  }));
}

export async function searchHotels(query = '') {
  if (!hasSupabaseConfig) {
    return mockHotels.filter((hotel) => includesQuery(hotel.name, query)).slice(0, 8);
  }

  const params = new URLSearchParams({
    select: '*',
    name: `ilike.*${query}*`,
    order: 'name.asc',
    limit: '8',
  });
  const data = await supabaseFetch(`hotels?${params.toString()}`);
  return data.map((item) => ({
    id: item.id,
    name: item.name,
    country: item.country,
    city: item.city,
    address: item.address,
    phone: item.phone,
    defaultNotice: item.default_notice,
    defaultMealPlan: item.default_meal_plan,
  }));
}

export async function saveReservation(reservation) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

  if (!hasSupabaseConfig) {
    localStorage.setItem('partnerHotelDocsReactDraftV1', JSON.stringify(reservation));
    return { ...reservation, id: reservation.id || `local-${Date.now()}` };
  }

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
