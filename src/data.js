export const partners = [
  {
    id: 'partner-naeil',
    name: '내일 투어',
    recipientName: '내일 투어',
    senderName: '에이앤드티 / 권혜원 상무, 김영애 부장',
    bankAccount: '국민은행 806401-00-080724 / 예금주: 주식회사에이앤드티',
    invoiceRemark: '상기 금액을 청구하오니 확인 후 입금을 부탁드립니다.',
    paymentTerms: 'Room payment will be charged in agent',
  },
  {
    id: 'partner-sample',
    name: '샘플 여행사',
    recipientName: '샘플 여행사 호텔팀',
    senderName: '에이앤드티 / 호텔 정산팀',
    bankAccount: '국민은행 806401-00-080724 / 예금주: 주식회사에이앤드티',
    invoiceRemark: '예약 확정 금액을 확인하시고 입금을 부탁드립니다.',
    paymentTerms: 'Prepaid by agent',
  },
];

export const hotels = [
  {
    id: 'hotel-villa-le-corail',
    name: 'Villa Le Corail - A Gran Melia Hotel Nha Trang',
    country: 'Vietnam',
    city: 'Nha Trang',
    address: 'Bai Tien, Duong De, Vinh Hoa Ward, Nha Trang City, Khanh Hoa Province, Vietnam 65000',
    phone: '+84-258-386-8888',
    defaultNotice:
      '체크인 시 투숙객 전원의 여권을 제출해 주세요.\n호텔에서 보증금 또는 현장 추가비를 요청할 수 있습니다.\n미니바, 룸서비스, 전화, 세탁 등 개인 이용 금액은 현장에서 직접 결제합니다.',
    defaultMealPlan: 'Breakfast included',
  },
  {
    id: 'hotel-sample',
    name: 'Sample Resort Guam',
    country: 'Guam',
    city: 'Tumon',
    address: 'Tumon Bay, Guam',
    phone: '+1-671-000-0000',
    defaultNotice:
      '체크인 시 여권과 예약 확정서를 제시해 주세요.\n보증금은 호텔 정책에 따라 현장에서 요청될 수 있습니다.',
    defaultMealPlan: 'Room only',
  },
];

export const initialReservation = {
  id: '',
  partnerId: 'partner-naeil',
  hotelId: 'hotel-villa-le-corail',
  partnerName: '내일 투어',
  senderName: '에이앤드티 / 권혜원 상무, 김영애 부장',
  issueDate: '2026-03-06',
  leadGuest: 'LEE ANNA 외 5인',
  confirmNo: '113771',
  status: '검수필요',
  hotelName: 'Villa Le Corail - A Gran Melia Hotel Nha Trang',
  hotelAddress: 'Bai Tien, Duong De, Vinh Hoa Ward, Nha Trang City, Khanh Hoa Province, Vietnam 65000',
  hotelPhone: '+84-258-386-8888',
  roomType: 'LUSH VILLA 3 BED',
  checkIn: '2026-04-03',
  checkOut: '2026-04-06',
  statedNights: 3,
  roomCount: 1,
  lateCheckout: '2026-04-06 18:00',
  adultCount: 5,
  childCount: 1,
  infantCount: 0,
  mealPlan: 'Breakfast included',
  paymentTerms: 'Room payment will be charged in agent',
  currency: 'USD',
  exchangeRate: 1494.6,
  exchangeRateDate: '2026-03-06',
  rounding: 'round',
  bankAccount: '국민은행 806401-00-080724 / 예금주: 주식회사에이앤드티',
  invoiceRemark: '상기 금액을 청구하오니 확인 후 입금을 부탁드립니다.',
  customerNotice:
    '체크인 시 투숙객 전원의 여권을 제출해 주세요.\n호텔에서 보증금 또는 현장 추가비를 요청할 수 있습니다.\n미니바, 룸서비스, 전화, 세탁 등 개인 이용 금액은 현장에서 직접 결제합니다.',
  charges: [
    { id: 'charge-room', label: '객실 요금', unitPrice: 525, quantity: 1, nights: 3 },
    { id: 'charge-late', label: '레이트 체크아웃', unitPrice: 262.5, quantity: 1, nights: 1 },
    { id: 'charge-breakfast', label: '성인 조식 추가 비용', unitPrice: 25, quantity: 5, nights: 1 },
  ],
};
