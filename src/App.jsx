import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import { initialReservation } from './data.js';
import {
  createExchangeRate,
  createHotel,
  createCompanyInfo,
  createCountry,
  createPartner,
  createPhraseSnippet,
  createRegion,
  deleteCompanyInfo,
  deleteCountry,
  deleteHotel,
  deletePartner,
  deletePhraseSnippet,
  deleteRegion,
  getHotelById,
  getPartnerById,
  listCountries,
  listCompanyInfos,
  listExchangeRates,
  listExchangeRatesByDate,
  listHotels,
  listPartners,
  listPhraseSnippets,
  listRegions,
  loadLatestReservation,
  loadLatestExchangeRate,
  saveReservation,
  searchCompanyInfos,
  searchHotels,
  searchPartners,
  updateCompanyInfo,
  updateCountry,
  updateHotel,
  updatePartner,
  updatePhraseSnippet,
  updateRegion,
} from './api.js';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function calcNights(checkIn, checkOut) {
  const normalizedCheckIn = normalizeDateInput(checkIn);
  const normalizedCheckOut = normalizeDateInput(checkOut);
  if (!normalizedCheckIn || !normalizedCheckOut) return 0;
  const start = new Date(`${normalizedCheckIn}T00:00:00Z`).getTime();
  const end = new Date(`${normalizedCheckOut}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let normalized = '';
  if (/^\d{8}$/.test(raw)) {
    normalized = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    normalized = raw;
  } else {
    return '';
  }

  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return normalized;
}

function addDays(dateValue, days) {
  const normalized = normalizeDateInput(dateValue);
  const count = Number(days || 0);
  if (!normalized || !Number.isFinite(count) || count < 0) return '';
  const date = new Date(`${normalized}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createInitialReservation() {
  return {
    ...initialReservation,
    issueDate: todayDate(),
    hotelRooms: [],
    roomLines: [emptyRoomLine('', 1)],
    mealPlanDays: [],
    noticeItems: [emptyNoticeItem()],
    charges: [],
  };
}

function emptyNoticeItem(content = '', options = {}) {
  return {
    id: makeId(),
    title: options.title || '',
    content,
    invoice: options.invoice ?? true,
    confirmation: options.confirmation ?? false,
  };
}

function normalizeNoticeItems(items, fallbackContent = '') {
  if (Array.isArray(items) && items.length) {
    return items.map((item) => ({
      id: item?.id || makeId(),
      title: item?.title || '',
      content: item?.content || '',
      invoice: item?.invoice ?? true,
      confirmation: item?.confirmation ?? false,
    }));
  }

  if (String(fallbackContent || '').trim()) {
    return [emptyNoticeItem(fallbackContent, { invoice: true, confirmation: false })];
  }

  return [emptyNoticeItem()];
}

function invoiceRemarkFromNoticeItems(items) {
  return normalizeNoticeItems(items)
    .filter((item) => item.invoice && String(item.content || '').trim())
    .map((item) => item.content)
    .join('\n\n');
}

function normalizeReservation(value) {
  const base = { ...createInitialReservation(), ...value };
  const noticeItems = normalizeNoticeItems(base.noticeItems, base.invoiceRemark);
  return {
    ...base,
    noticeItems,
    invoiceRemark: invoiceRemarkFromNoticeItems(noticeItems),
  };
}

function emptyRoomLine(roomType = '', roomCount = 1) {
  return {
    id: makeId(),
    roomType,
    bedTypes: {
      double: false,
      twin: false,
      doubleOrTwin: false,
      extraBed: false,
    },
    roomCount,
  };
}

function normalizeRoomLine(line, fallbackRoomType = '', fallbackRoomCount = 1) {
  const bedTypes = line?.bedTypes || {};
  return {
    id: line?.id || makeId(),
    roomType: line?.roomType || fallbackRoomType || '',
    bedTypes: {
      double: Boolean(bedTypes.double),
      twin: Boolean(bedTypes.twin),
      doubleOrTwin: Boolean(bedTypes.doubleOrTwin),
      extraBed: Boolean(bedTypes.extraBed),
    },
    roomCount: Number(line?.roomCount || fallbackRoomCount || 1),
  };
}

function getRoomLines(reservation) {
  if (Array.isArray(reservation.roomLines) && reservation.roomLines.length) {
    return reservation.roomLines.map((line) => normalizeRoomLine(line));
  }
  return [normalizeRoomLine(null, reservation.roomType, reservation.roomCount)];
}

function roomLineBedText(line) {
  const labels = [];
  if (line.bedTypes?.double) labels.push('더블');
  if (line.bedTypes?.twin) labels.push('트윈');
  if (line.bedTypes?.doubleOrTwin) labels.push('더블 OR 트윈');
  if (line.bedTypes?.extraBed) labels.push('+ EXTRA BED');
  return labels.join('');
}

function summarizeRoomLines(reservation) {
  return getRoomLines(reservation)
    .map((line) => {
      const bedText = roomLineBedText(line);
      const typeText = [line.roomType, bedText].filter(Boolean).join(' ');
      if (!typeText) return '';
      return `${typeText} ${line.roomCount || 0}실`;
    })
    .filter(Boolean)
    .join(',\n') || '-';
}

function totalRoomCount(reservation) {
  return getRoomLines(reservation).reduce((sum, line) => sum + Number(line.roomCount || 0), 0) || Number(reservation.roomCount || 1) || 1;
}

const MEAL_OPTIONS = ['Breakfast included', 'ALL AI', 'Breakfast included+AI'];

function mealDayText(day) {
  const labels = [];
  if (day?.breakfast) labels.push('Breakfast');
  if (day?.ai) labels.push('AI');
  return labels.join('|') || '-';
}

function mealPlanFromDays(days) {
  return days.map(mealDayText).join('/');
}

function normalizeMealPlanDays(days, nights) {
  const count = Math.max(0, Number(nights || 0));
  const source = Array.isArray(days) ? days : [];
  return Array.from({ length: count }, (_, index) => ({
    breakfast: source[index]?.breakfast ?? false,
    ai: source[index]?.ai ?? false,
  }));
}

function inferMealPlanOption(value) {
  const mealPlan = String(value || '');
  if (MEAL_OPTIONS.includes(mealPlan)) return mealPlan;
  if (mealPlan.includes('|') || mealPlan.includes('/')) return 'Breakfast included+AI';
  return mealPlan;
}

function stayDateTime(dateValue, timeValue) {
  return [dateValue, timeValue].filter(Boolean).join(' ');
}

function formatVoucherDate(dateValue) {
  const normalized = normalizeDateInput(dateValue);
  if (!normalized) return dateValue || '-';
  const date = new Date(`${normalized}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = date.getUTCDate();
  const weekday = date.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${year} ${month} ${day} (${weekday})`;
}

const LOCAL_DOC_VERSION = 1;
const RECENT_FILES_KEY = 'partner-hotel-docs-recent-files';
const HANDLE_DB_NAME = 'partner-hotel-docs-files';
const HANDLE_STORE_NAME = 'file-handles';

function sanitizeFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function defaultLocalFileName(reservation) {
  const guest = sanitizeFileName(reservation.leadGuest) || '예약문서';
  const hotel = sanitizeFileName(reservation.hotelName);
  const date = sanitizeFileName(reservation.issueDate) || todayDate();
  return [date, guest, hotel].filter(Boolean).join('_') + '.html';
}

function escapeScriptJson(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function buildLocalHtml(reservation) {
  const payload = {
    app: 'partner-hotel-docs-app',
    version: LOCAL_DOC_VERSION,
    savedAt: new Date().toISOString(),
    reservation,
  };

  const title = `${reservation.leadGuest || '예약문서'} - 인보이스& 바우처`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title.replace(/[<>&"]/g, '')}</title>
  <style>
    body { margin: 0; font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", system-ui, sans-serif; background: #edf1f6; color: #172033; }
    main { max-width: 760px; margin: 12vh auto; padding: 28px; border: 1px solid #d9e0ea; border-radius: 10px; background: #fff; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 8px 0; color: #667084; line-height: 1.6; }
    dl { display: grid; grid-template-columns: 120px 1fr; gap: 8px 14px; margin-top: 22px; }
    dt { color: #667084; font-weight: 800; }
    dd { margin: 0; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <h1>거래처 인보이스·호텔 확정서 저장 파일</h1>
    <p>이 HTML 파일은 Partner Hotel Docs 앱에서 다시 불러올 수 있는 로컬 저장 파일입니다.</p>
    <dl>
      <dt>예약명</dt><dd>${reservation.leadGuest || '-'}</dd>
      <dt>호텔</dt><dd>${reservation.hotelName || '-'}</dd>
      <dt>체크인</dt><dd>${reservation.checkIn || '-'}</dd>
      <dt>저장일시</dt><dd>${payload.savedAt}</dd>
    </dl>
  </main>
  <script id="partner-hotel-docs-data" type="application/json">${escapeScriptJson(payload)}</script>
</body>
</html>`;
}

function parseLocalHtml(text) {
  const documentNode = new DOMParser().parseFromString(text, 'text/html');
  const dataNode = documentNode.getElementById('partner-hotel-docs-data');
  if (!dataNode?.textContent) {
    throw new Error('Partner Hotel Docs 저장 데이터가 없는 HTML 파일입니다.');
  }

  const payload = JSON.parse(dataNode.textContent);
  if (payload?.app !== 'partner-hotel-docs-app' || !payload.reservation) {
    throw new Error('이 앱에서 저장한 HTML 파일이 아닙니다.');
  }

  return payload.reservation;
}

function readRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeRecentFiles(items) {
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(items.slice(0, 8)));
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeFileHandle(id, handle) {
  if (!handle || !window.indexedDB) return;
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    transaction.objectStore(HANDLE_STORE_NAME).put(handle, id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readFileHandle(id) {
  if (!window.indexedDB) return null;
  const db = await openHandleDb();
  const handle = await new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(HANDLE_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

async function verifyFilePermission(handle, mode = 'read') {
  if (!handle?.queryPermission || !handle?.requestPermission) return true;
  const options = { mode };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

function lineTotal(line) {
  return Number(line.unitPrice || 0) * Number(line.quantity || 0) * Number(line.nights || 0);
}

function money(value, currency = 'USD') {
  return `${currency} ${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function krw(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function applyRounding(value, mode) {
  if (mode === 'floor') return Math.floor(value);
  if (mode === 'ceil') return Math.ceil(value);
  return Math.round(value);
}

function emptyCompanyInfo() {
  return {
    id: 'default',
    name: '',
    ciUrl: '',
    address: '',
    phone: '',
    email: '',
    bankAccount: '',
    sealUrl: '',
  };
}

function emptyPhraseSnippet() {
  return {
    id: '',
    title: '',
    content: '',
  };
}

function SearchSelect({ label, value, loadOptions, getLabel, getMeta, onSelect, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    loadOptions(query)
      .then((items) => {
        if (!ignore) setResults(items);
      })
      .catch(() => {
        if (!ignore) setResults([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [loadOptions, query]);

  return (
    <div className="field search-field">
      <label>{label}</label>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (results.length > 0 || loading) && (
        <div className="search-menu">
          {loading && <div className="search-loading">검색 중입니다</div>}
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuery(getLabel(item));
                setOpen(false);
                onSelect(item);
              }}
            >
              <strong>{getLabel(item)}</strong>
              <span>{getMeta?.(item)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className = '' }) {
  const fallbackId = useId();
  const child = isValidElement(children) ? children : null;
  const controlId = child?.props.id || `field-${fallbackId}`;
  const control = child
    ? cloneElement(child, {
        id: controlId,
        onFocus: (event) => {
          child.props.onFocus?.(event);
          if (child.props.type === 'number' && typeof event.target.select === 'function') {
            event.target.select();
          }
        },
        onMouseUp: (event) => {
          child.props.onMouseUp?.(event);
          if (child.props.type === 'number') {
            event.preventDefault();
          }
        },
      })
    : children;

  return (
    <div className={`field ${className}`}>
      <label htmlFor={child ? controlId : undefined}>{label}</label>
      {control}
    </div>
  );
}

function Step({ number, title, children }) {
  return (
    <section className="work-step">
      <div className="step-index">{number}</div>
      <div>
        <h3 className="step-title">{title}</h3>
        {children}
      </div>
    </section>
  );
}

function App() {
  const [reservation, setReservation] = useState(() => createInitialReservation());
  const [activeTab, setActiveTab] = useState('invoice');
  const [activeStep, setActiveStep] = useState('source');
  const [saveState, setSaveState] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterInitialTab, setMasterInitialTab] = useState('hotels');
  const [checkInError, setCheckInError] = useState('');
  const [currentFileHandle, setCurrentFileHandle] = useState(null);
  const [currentFileId, setCurrentFileId] = useState('');
  const [currentFileName, setCurrentFileName] = useState('');
  const [recentFiles, setRecentFiles] = useState(() => readRecentFiles());
  const [recentOpen, setRecentOpen] = useState(false);
  const [issueDateEditing, setIssueDateEditing] = useState(false);
  const [issueDateError, setIssueDateError] = useState('');
  const [exchangeSaveState, setExchangeSaveState] = useState('');
  const [actionNotice, setActionNotice] = useState(null);
  const [phraseSnippets, setPhraseSnippets] = useState([]);
  const [phraseQuery, setPhraseQuery] = useState('');
  const [phrasePickerOpen, setPhrasePickerOpen] = useState(false);
  const [activeNoticeItemId, setActiveNoticeItemId] = useState('');
  const nightsInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const exchangeRateInputId = useId();
  const issueDateInputId = useId();

  useEffect(() => {
    if (!masterOpen && !phrasePickerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [masterOpen, phrasePickerOpen]);

  useEffect(() => {
    function closeRecentMenu(event) {
      if (!event.target.closest?.('.recent-menu-wrap')) setRecentOpen(false);
    }

    document.addEventListener('click', closeRecentMenu);
    return () => document.removeEventListener('click', closeRecentMenu);
  }, []);

  useEffect(() => {
    if (!actionNotice) return undefined;
    const timer = window.setTimeout(() => setActionNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  useEffect(() => {
    if (exchangeSaveState.includes('환율 저장 완료')) {
      announceAction('환율 저장 완료');
    } else if (exchangeSaveState.includes('환율 저장 실패')) {
      announceAction('환율 저장 실패', 'error');
    } else if (exchangeSaveState.includes('환율 저장 취소')) {
      announceAction('환율 저장을 취소했습니다', 'info');
    }
  }, [exchangeSaveState]);

  useEffect(() => {
    function fitPrintPage() {
      document.documentElement.style.setProperty('--print-scale', '1');
      const page = document.querySelector('.document');
      const content = document.querySelector('.document-content');
      if (!page || !content) return;
      const pageStyle = window.getComputedStyle(page);
      const paddingTop = Number.parseFloat(pageStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(pageStyle.paddingBottom) || 0;
      const availableHeight = 1123 - paddingTop - paddingBottom;
      const contentHeight = content.scrollHeight;
      const scale = contentHeight > availableHeight
        ? Math.min(1, availableHeight / contentHeight)
        : 1;
      document.documentElement.style.setProperty('--print-scale', scale.toFixed(3));
    }

    function resetPrintPage() {
      document.documentElement.style.setProperty('--print-scale', '1');
    }

    window.addEventListener('beforeprint', fitPrintPage);
    window.addEventListener('afterprint', resetPrintPage);
    return () => {
      window.removeEventListener('beforeprint', fitPrintPage);
      window.removeEventListener('afterprint', resetPrintPage);
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    loadLatestExchangeRate(reservation.currency || 'USD')
      .then((savedRate) => {
        if (ignore || !savedRate) return;
        setReservation((current) => ({
          ...current,
          currency: savedRate.currency || current.currency,
          exchangeRate: savedRate.rate,
          exchangeRateDate: savedRate.exchangeDate,
        }));
        setExchangeSaveState(`저장 환율 불러옴: ${savedRate.exchangeDate}`);
      })
      .catch((error) => {
        console.error(error);
        if (!ignore) setExchangeSaveState('저장 환율을 불러오지 못했습니다');
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    listPhraseSnippets()
      .then((items) => {
        if (!ignore) setPhraseSnippets(items);
      })
      .catch((error) => console.error(error));
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!reservation.partnerId || reservation.partnerCiUrl) return undefined;
    let ignore = false;
    getPartnerById(reservation.partnerId)
      .then((partner) => {
        if (ignore || !partner) return;
        setReservation((current) => (
          current.partnerId === partner.id && !current.partnerCiUrl
            ? {
                ...current,
                partnerCiUrl: partner.ciUrl || '',
                partnerName: partner.recipientName || partner.name || current.partnerName,
              }
            : current
        ));
      })
      .catch((error) => console.error(error));
    return () => {
      ignore = true;
    };
  }, [reservation.partnerId, reservation.partnerCiUrl]);

  useEffect(() => {
    if (!reservation.hotelId || reservation.hotelLogoUrl) return undefined;
    let ignore = false;
    getHotelById(reservation.hotelId)
      .then((hotel) => {
        if (ignore || !hotel) return;
        setReservation((current) => (
          current.hotelId === hotel.id && !current.hotelLogoUrl
            ? {
                ...current,
                hotelName: hotel.name || current.hotelName,
                hotelAddress: hotel.address || current.hotelAddress,
                hotelPhone: hotel.phone || current.hotelPhone,
                hotelLogoUrl: hotel.logoUrl || '',
                hotelRooms: hotel.rooms || current.hotelRooms,
              }
            : current
        ));
      })
      .catch((error) => console.error(error));
    return () => {
      ignore = true;
    };
  }, [reservation.hotelId, reservation.hotelLogoUrl]);

  const autoNights = calcNights(reservation.checkIn, reservation.checkOut);
  const roomOptions = useMemo(() => {
    const rooms = Array.isArray(reservation.hotelRooms) ? reservation.hotelRooms.filter(Boolean) : [];
    if (reservation.roomType && !rooms.includes(reservation.roomType)) return [reservation.roomType, ...rooms];
    return rooms;
  }, [reservation.hotelRooms, reservation.roomType]);
  const roomLines = useMemo(() => getRoomLines(reservation), [reservation.roomLines, reservation.roomType, reservation.roomCount]);
  const roomSummary = useMemo(() => summarizeRoomLines(reservation), [reservation.roomLines, reservation.roomType, reservation.roomCount]);
  const noticeItems = useMemo(
    () => normalizeNoticeItems(reservation.noticeItems, reservation.invoiceRemark),
    [reservation.noticeItems, reservation.invoiceRemark]
  );
  const selectedMealOption = reservation.mealPlanOption || inferMealPlanOption(reservation.mealPlan);
  const mealPlanDays = useMemo(
    () => normalizeMealPlanDays(reservation.mealPlanDays, reservation.statedNights || autoNights),
    [reservation.mealPlanDays, reservation.statedNights, autoNights]
  );
  const foreignTotal = useMemo(
    () => reservation.charges.reduce((sum, line) => sum + lineTotal(line), 0),
    [reservation.charges]
  );
  const krwTotal = applyRounding(foreignTotal * Number(reservation.exchangeRate || 0), reservation.rounding);

  function patch(changes) {
    setReservation((current) => ({ ...current, ...changes }));
  }

  function patchField(key, value) {
    setReservation((current) => {
      return { ...current, [key]: value };
    });
  }

  function announceAction(message, type = 'success') {
    setActionNotice({ id: makeId(), message, type });
  }

  function syncNoticeItems(nextItems) {
    const normalizedItems = normalizeNoticeItems(nextItems);
    patch({
      noticeItems: normalizedItems,
      invoiceRemark: invoiceRemarkFromNoticeItems(normalizedItems),
    });
  }

  function addNoticeItem() {
    syncNoticeItems([...noticeItems, emptyNoticeItem()]);
  }

  function removeNoticeItem(id) {
    if (noticeItems.length <= 1) {
      syncNoticeItems([emptyNoticeItem()]);
      return;
    }
    syncNoticeItems(noticeItems.filter((item) => item.id !== id));
  }

  function updateNoticeItem(id, changes) {
    syncNoticeItems(noticeItems.map((item) => (
      item.id === id ? { ...item, ...changes } : item
    )));
  }

  function openPhrasePicker(id) {
    const item = noticeItems.find((notice) => notice.id === id);
    setActiveNoticeItemId(id);
    setPhraseQuery(item?.title || '');
    setPhrasePickerOpen(true);
  }

  function handleIssueDateChange(value) {
    patchField('issueDate', value);
  }

  function handleIssueDateBlur(value) {
    const raw = String(value || '').trim();
    const normalized = normalizeDateInput(raw);
    if (normalized) {
      patchField('issueDate', normalized);
      setIssueDateError('');
    } else if (!raw) {
      patchField('issueDate', todayDate());
      setIssueDateError('');
    } else {
      setIssueDateError('YYYY-MM-DD 또는 YYYYMMDD로 입력해 주세요.');
    }
    setIssueDateEditing(false);
  }

  async function saveExchangeRate() {
    const issueDateRaw = String(reservation.issueDate || '').trim();
    const exchangeDate = normalizeDateInput(issueDateRaw) || (!issueDateRaw ? todayDate() : '');
    const rate = Number(reservation.exchangeRate || 0);
    const currency = reservation.currency || 'USD';

    if (!exchangeDate) {
      setIssueDateError('YYYY-MM-DD 또는 YYYYMMDD로 입력해 주세요.');
      setExchangeSaveState('작성일을 확인해 주세요');
      return;
    }

    if (!rate || rate <= 0) {
      setExchangeSaveState('환율을 입력해 주세요');
      return;
    }

    try {
      setExchangeSaveState('환율 확인 중');
      const existing = await listExchangeRatesByDate(exchangeDate, currency);
      if (existing.length) {
        const confirmed = window.confirm('저장된 환율정보가 있습니다 수정하시겠습니까?');
        if (!confirmed) {
          setExchangeSaveState('환율 저장 취소');
          return;
        }
      }

      const saved = await createExchangeRate({ currency, rate, exchangeDate });
      patch({
        currency: saved.currency,
        exchangeRate: saved.rate,
        exchangeRateDate: saved.exchangeDate,
        issueDate: saved.exchangeDate,
      });
      setExchangeSaveState(`환율 저장 완료: ${formatDateTime(saved.savedAt)}`);
    } catch (error) {
      console.error(error);
      setExchangeSaveState('환율 저장 실패');
    }
  }

  function handleCheckInChange(value) {
    const normalized = normalizeDateInput(value);
    setReservation((current) => {
      const nights = Number(current.statedNights || 0);
      const checkIn = normalized || value;
      return {
        ...current,
        checkIn,
        checkOut: normalized && nights > 0 ? addDays(normalized, nights) : current.checkOut,
      };
    });

    if (normalized) {
      setCheckInError('');
      requestAnimationFrame(() => {
        nightsInputRef.current?.focus();
        nightsInputRef.current?.select?.();
      });
    }
  }

  function handleCheckInBlur() {
    const normalized = normalizeDateInput(reservation.checkIn);
    if (!normalized) {
      setCheckInError(
        String(reservation.checkIn || '').trim() ? '체크인 날짜는 YYYY-MM-DD 또는 YYYYMMDD로 입력해 주세요.' : ''
      );
      return;
    }

    const nights = Number(reservation.statedNights || 0);
    setCheckInError('');
    setReservation((current) => {
      return {
        ...current,
        checkIn: normalized,
        checkOut: nights > 0 ? addDays(normalized, nights) : current.checkOut,
      };
    });
  }

  function handleNightsChange(value) {
    const nights = Number(value || 0);
    setReservation((current) => {
      const next = {
        ...current,
        statedNights: nights,
        checkOut: normalizeDateInput(current.checkIn) && nights > 0 ? addDays(current.checkIn, nights) : current.checkOut,
      };
      if (current.mealPlanOption === 'Breakfast included+AI') {
        const mealPlanDays = normalizeMealPlanDays(current.mealPlanDays, nights);
        return {
          ...next,
          mealPlanDays,
          mealPlan: mealPlanFromDays(mealPlanDays),
        };
      }
      return next;
    });
  }

  function handleMealPlanOptionChange(value) {
    const nights = Number(reservation.statedNights || autoNights || 0);
    if (value === 'Breakfast included+AI') {
      const mealPlanDays = normalizeMealPlanDays(reservation.mealPlanDays, nights);
      patch({
        mealPlanOption: value,
        mealPlanDays,
        mealPlan: mealPlanFromDays(mealPlanDays),
      });
      return;
    }

    patch({
      mealPlanOption: value,
      mealPlanDays: [],
      mealPlan: value,
    });
  }

  function toggleMealPlanDay(index, key, checked) {
    const nights = Number(reservation.statedNights || autoNights || 0);
    const mealPlanDays = normalizeMealPlanDays(reservation.mealPlanDays, nights).map((day, dayIndex) => (
      dayIndex === index
        ? {
            breakfast: key === 'breakfast' ? checked : checked ? false : day.breakfast,
            ai: key === 'ai' ? checked : checked ? false : day.ai,
          }
        : day
    ));
    patch({
      mealPlanOption: 'Breakfast included+AI',
      mealPlanDays,
      mealPlan: mealPlanFromDays(mealPlanDays),
    });
  }

  function applyPhraseSnippet(id) {
    const phrase = phraseSnippets.find((item) => item.id === id);
    if (!phrase) return;
    setPhraseQuery(phrase.title || '자주쓰는 문구');
    const targetId = activeNoticeItemId || noticeItems[0]?.id;
    if (targetId) {
      updateNoticeItem(targetId, {
        title: phrase.title || '자주쓰는 문구',
        content: phrase.content || '',
      });
    }
    setPhrasePickerOpen(false);
  }

  function selectPartner(partner) {
    const partnerNotice = normalizeNoticeItems([], partner.invoiceRemark);
    patch({
      partnerId: partner.id,
      partnerCiUrl: partner.ciUrl || '',
      partnerName: partner.recipientName || partner.name,
      paymentTerms: partner.paymentTerms,
      invoiceRemark: partner.invoiceRemark,
      noticeItems: partnerNotice,
    });
  }

  function selectCompany(company) {
    patch({
      companyId: company.id,
      companyName: company.name,
      companyCiUrl: company.ciUrl,
      companyAddress: company.address,
      companyPhone: company.phone,
      companyEmail: company.email,
      companySealUrl: company.sealUrl,
      senderName: company.name,
      bankAccount: company.bankAccount,
    });
  }

  function selectHotel(hotel) {
    const defaultMealOption = inferMealPlanOption(hotel.defaultMealPlan);
    const defaultMealDays = defaultMealOption === 'Breakfast included+AI'
      ? normalizeMealPlanDays([], Number(reservation.statedNights || autoNights || 0))
      : [];
    patch({
      hotelId: hotel.id,
      hotelName: hotel.name,
      hotelAddress: hotel.address,
      hotelPhone: hotel.phone,
      hotelLogoUrl: hotel.logoUrl,
      hotelRooms: hotel.rooms || [],
      roomType: hotel.rooms?.[0] || '',
      roomLines: [emptyRoomLine(hotel.rooms?.[0] || '', 1)],
      checkInTime: hotel.defaultCheckInTime || '',
      checkOutTime: hotel.defaultCheckOutTime || '',
      mealPlan: defaultMealOption === 'Breakfast included+AI' ? mealPlanFromDays(defaultMealDays) : hotel.defaultMealPlan,
      mealPlanOption: defaultMealOption,
      mealPlanDays: defaultMealDays,
      customerNotice: hotel.defaultNotice,
    });
  }

  function handleMasterDataChange(type, item) {
    if (!item?.id) return;

    if (type === 'partner') {
      setReservation((current) => (
        current.partnerId === item.id
          ? {
              ...current,
              partnerCiUrl: item.ciUrl || '',
              partnerName: item.recipientName || item.name || current.partnerName,
              paymentTerms: item.paymentTerms || '',
              invoiceRemark: item.invoiceRemark || '',
            }
          : current
      ));
      return;
    }

    if (type === 'hotel') {
      setReservation((current) => (
        current.hotelId === item.id
          ? {
              ...current,
              hotelName: item.name || current.hotelName,
              hotelAddress: item.address || '',
              hotelPhone: item.phone || '',
              hotelLogoUrl: item.logoUrl || '',
              hotelRooms: item.rooms || current.hotelRooms,
              customerNotice: item.defaultNotice || current.customerNotice,
            }
          : current
      ));
      return;
    }

    if (type === 'company') {
      setReservation((current) => (
        current.companyId === item.id
          ? {
              ...current,
              companyName: item.name || current.companyName,
              companyCiUrl: item.ciUrl || '',
              companyAddress: item.address || '',
              companyPhone: item.phone || '',
              companyEmail: item.email || '',
              companySealUrl: item.sealUrl || '',
              senderName: item.name || current.senderName,
              bankAccount: item.bankAccount || '',
            }
          : current
      ));
    }
  }

  function addCharge(type) {
    const roomCount = totalRoomCount(reservation);
    const adultCount = Number(reservation.adultCount || 1) || 1;
    const nights = autoNights || Number(reservation.statedNights || 1) || 1;
    const templates = {
      room: { label: '객실 요금', unitPrice: 0, quantity: roomCount, nights },
      late: { label: '레이트 체크아웃', unitPrice: 0, quantity: roomCount, nights: 1 },
      breakfast: { label: '추가조식', unitPrice: 0, quantity: adultCount, nights: 1 },
      extraBed: { label: '엑스트라베드', unitPrice: 0, quantity: roomCount, nights },
      custom: { label: '기타', unitPrice: 0, quantity: 1, nights: 1 },
    };
    patch({ charges: [...reservation.charges, { id: makeId(), ...(templates[type] || templates.custom) }] });
  }

  function updateCharge(id, key, value) {
    patch({
      charges: reservation.charges.map((line) =>
        line.id === id ? { ...line, [key]: key === 'label' ? value : Number(value || 0) } : line
      ),
    });
  }

  function removeCharge(id) {
    patch({ charges: reservation.charges.filter((line) => line.id !== id) });
  }

  function syncRoomLinePatch(nextLines) {
    const normalizedLines = nextLines.map((line) => normalizeRoomLine(line));
    const firstLine = normalizedLines[0] || emptyRoomLine();
    patch({
      roomLines: normalizedLines,
      roomType: firstLine.roomType,
      roomCount: totalRoomCount({ ...reservation, roomLines: normalizedLines }),
    });
  }

  function updateRoomLine(id, changes) {
    syncRoomLinePatch(
      roomLines.map((line) => (line.id === id ? { ...line, ...changes } : line))
    );
  }

  function updateRoomLineBedType(id, key, checked) {
    syncRoomLinePatch(
      roomLines.map((line) =>
        line.id === id
          ? {
              ...line,
              bedTypes: {
                ...line.bedTypes,
                [key]: checked,
              },
            }
          : line
      )
    );
  }

  function addRoomLine() {
    syncRoomLinePatch([...roomLines, emptyRoomLine(roomOptions[0] || '', 1)]);
  }

  function removeRoomLine(id) {
    if (roomLines.length <= 1) return;
    syncRoomLinePatch(roomLines.filter((line) => line.id !== id));
  }

  function toggleTimeField(key, value) {
    patchField(key, reservation[key] === value ? '' : value);
  }

  function saveDraft() {
    setSaveState('저장 중');
    announceAction('Supabase 저장 중...', 'info');
    saveReservation(reservation)
      .then((saved) => {
        setReservation((current) => ({ ...current, id: saved.id || current.id }));
        setSaveState('Supabase 저장 완료');
        announceAction('Supabase 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setSaveState('Supabase 저장 실패');
        announceAction('Supabase 저장 실패', 'error');
      });
  }

  function resetLocalDocument() {
    setReservation((current) => ({
      ...createInitialReservation(),
      currency: current.currency,
      exchangeRate: current.exchangeRate,
      exchangeRateDate: current.exchangeRateDate,
    }));
    setActiveTab('invoice');
    setActiveStep('source');
    setCheckInError('');
    setIssueDateError('');
    setIssueDateEditing(false);
    setPhraseQuery('');
    setPhrasePickerOpen(false);
    setActiveNoticeItemId('');
    setCurrentFileHandle(null);
    setCurrentFileId('');
    setCurrentFileName('');
    setSaveState('새 문서로 초기화했습니다.');
    announceAction('초기화 완료');
  }

  function rememberRecentFile(name, handle, id = '') {
    const fileId = id || (handle ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : '');
    const nextItem = {
      id: fileId,
      name: name || '저장 파일.html',
      savedAt: new Date().toISOString(),
      canReopen: Boolean(handle && fileId),
    };
    const nextItems = [nextItem, ...recentFiles.filter((item) => item.id !== fileId && item.name !== nextItem.name)];
    setRecentFiles(nextItems.slice(0, 8));
    writeRecentFiles(nextItems);
    if (handle && fileId) {
      storeFileHandle(fileId, handle).catch((error) => console.error(error));
    }
    return fileId;
  }

  async function writeHtmlToHandle(handle, html) {
    if (!(await verifyFilePermission(handle, 'readwrite'))) {
      throw new Error('파일 저장 권한이 허용되지 않았습니다.');
    }

    const writable = await handle.createWritable();
    await writable.write(html);
    await writable.close();
  }

  function downloadLocalHtml(fileName, html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function saveLocalAs() {
    const fileName = defaultLocalFileName(reservation);
    const html = buildLocalHtml(reservation);

    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'HTML 저장 파일',
            accept: { 'text/html': ['.html'] },
          },
        ],
      });
      await writeHtmlToHandle(handle, html);
      const nextId = rememberRecentFile(handle.name, handle);
      setCurrentFileHandle(handle);
      setCurrentFileId(nextId);
      setCurrentFileName(handle.name);
      setSaveState(`${handle.name} 저장 완료`);
      announceAction('HTML 저장 완료');
      return;
    }

    downloadLocalHtml(fileName, html);
    rememberRecentFile(fileName, null);
    setCurrentFileName(fileName);
    setSaveState(`${fileName} 다운로드 완료`);
    announceAction('HTML 다운로드 완료');
  }

  async function saveLocalFile() {
    try {
      if (!currentFileHandle) {
        await saveLocalAs();
        return;
      }

      const html = buildLocalHtml(reservation);
      await writeHtmlToHandle(currentFileHandle, html);
      const nextId = rememberRecentFile(currentFileHandle.name, currentFileHandle, currentFileId);
      setCurrentFileId(nextId);
      setCurrentFileName(currentFileHandle.name);
      setSaveState(`${currentFileHandle.name} 저장 완료`);
      announceAction('HTML 저장 완료');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      announceAction('HTML 저장 실패', 'error');
      alert(error.message || 'HTML 파일을 저장하지 못했습니다.');
    }
  }

  async function saveLocalFileAs() {
    try {
      await saveLocalAs();
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      announceAction('HTML 저장 실패', 'error');
      alert(error.message || 'HTML 파일을 저장하지 못했습니다.');
    }
  }

  async function applyLatestDbExchangeRate(baseReservation) {
    try {
      const savedRate = await loadLatestExchangeRate(baseReservation.currency || 'USD');
      if (!savedRate) return baseReservation;
      setExchangeSaveState(`DB 환율 불러옴: ${savedRate.exchangeDate}`);
      return {
        ...baseReservation,
        currency: savedRate.currency || baseReservation.currency,
        exchangeRate: savedRate.rate,
        exchangeRateDate: savedRate.exchangeDate,
      };
    } catch (error) {
      console.error(error);
      setExchangeSaveState('DB 환율을 불러오지 못했습니다');
      return baseReservation;
    }
  }

  async function loadLocalReservationFromText(text, fileName, handle = null, id = '') {
    const loaded = parseLocalHtml(text);
    const nextReservation = await applyLatestDbExchangeRate(normalizeReservation(loaded));
    setReservation(nextReservation);
    setCurrentFileHandle(handle);
    setCurrentFileId(id);
    setCurrentFileName(fileName || '');
    if (fileName) rememberRecentFile(fileName, handle, id);
    setSaveState(`${fileName || 'HTML 파일'} 불러오기 완료`);
  }

  async function loadLocalFile() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'HTML 저장 파일',
              accept: { 'text/html': ['.html', '.htm'] },
            },
          ],
        });
        if (!(await verifyFilePermission(handle, 'read'))) return;
        const file = await handle.getFile();
        await loadLocalReservationFromText(await file.text(), file.name, handle);
        return;
      }

      fileInputRef.current?.click();
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      alert(error.message || 'HTML 파일을 불러오지 못했습니다.');
    }
  }

  async function handleLocalFileInput(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await loadLocalReservationFromText(await file.text(), file.name);
    } catch (error) {
      console.error(error);
      alert(error.message || 'HTML 파일을 불러오지 못했습니다.');
    }
  }

  async function openRecentFile(item) {
    setRecentOpen(false);
    if (!item.canReopen || !item.id) {
      alert('브라우저 권한이 없는 최근 항목입니다. 불러오기 버튼으로 파일을 직접 선택해 주세요.');
      return;
    }

    try {
      const handle = await readFileHandle(item.id);
      if (!handle) {
        alert('최근 파일 권한을 찾지 못했습니다. 불러오기 버튼으로 다시 선택해 주세요.');
        return;
      }
      if (!(await verifyFilePermission(handle, 'read'))) return;
      const file = await handle.getFile();
      await loadLocalReservationFromText(await file.text(), file.name, handle, item.id);
    } catch (error) {
      console.error(error);
      alert(error.message || '최근 파일을 열지 못했습니다.');
    }
  }

  function loadDraft() {
    loadLatestReservation()
      .then((saved) => {
        if (!saved) {
          alert('Supabase에 저장된 예약이 없습니다.');
          return;
        }
        setReservation(normalizeReservation(saved));
      })
      .catch((error) => {
        console.error(error);
        alert('Supabase 예약 데이터를 불러오지 못했습니다.');
      });
  }

  const tabs = [
    ['invoice', '거래처 인보이스'],
    ['confirmation', '호텔 확정서'],
  ];
  const workflowSteps = [
    ['source', '1', '기본정보'],
    ['booking', '2', '예약정보'],
    ['charges', '3', '요금'],
    ['settlement', '4', '리마크'],
  ];
  const filteredPhraseSnippets = phraseSnippets.filter((phrase) => {
    const keyword = phraseQuery.trim().toLowerCase();
    if (!keyword) return true;
    return `${phrase.title || ''} ${phrase.content || ''}`.toLowerCase().includes(keyword);
  });

  return (
    <>
      <header className="app-topbar">
        <div className="header-title-cluster">
          <button
            className="btn btn-master"
            type="button"
            onClick={() => {
              setMasterInitialTab('hotels');
              setMasterOpen(true);
            }}
          >
            마스터 관리
          </button>
          <div className="brand">
            <h1 className="brand-title">인보이스& 바우처</h1>
          </div>
        </div>
        <div className="header-exchange">
          <label htmlFor={exchangeRateInputId}>
            <span>환율</span>
            <input
              id={exchangeRateInputId}
              type="number"
              min="0"
              step="0.01"
              value={reservation.exchangeRate}
              onFocus={(event) => event.target.select()}
              onMouseUp={(event) => event.preventDefault()}
              onChange={(event) => patchField('exchangeRate', event.target.value)}
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={saveExchangeRate}>
            저장
          </button>
        </div>
        <label className={`header-date-field ${issueDateError ? 'has-error' : ''}`} htmlFor={issueDateInputId}>
          <span>{issueDateError || '작성일'}</span>
          <input
            id={issueDateInputId}
            type="text"
            inputMode="numeric"
            value={reservation.issueDate}
            readOnly={!issueDateEditing}
            title="클릭하면 수정할 수 있습니다. YYYY-MM-DD 또는 YYYYMMDD로 입력하세요."
            onClick={() => setIssueDateEditing(true)}
            onFocus={() => setIssueDateEditing(true)}
            onChange={(event) => handleIssueDateChange(event.target.value)}
            onBlur={(event) => handleIssueDateBlur(event.target.value)}
          />
        </label>
        <div className="toolbar file-actions">
          <button className="btn" type="button" onClick={resetLocalDocument}>
            초기화
          </button>
          <button className="btn btn-primary" type="button" onClick={saveLocalFile}>
            저장
          </button>
          <button className="btn" type="button" onClick={saveLocalFileAs}>
            다른 이름으로 저장
          </button>
          <button className="btn" type="button" onClick={loadLocalFile}>
            불러오기
          </button>
          <div className="recent-menu-wrap">
            <button
              className="btn"
              type="button"
              aria-expanded={recentOpen}
              onClick={(event) => {
                event.stopPropagation();
                setRecentOpen((open) => !open);
              }}
            >
              최근파일
            </button>
            {recentOpen && (
              <div className="recent-menu">
                {recentFiles.length === 0 && <div className="recent-empty">최근 파일이 없습니다.</div>}
                {recentFiles.map((item) => (
                  <button key={`${item.id}-${item.name}`} type="button" onClick={() => openRecentFile(item)}>
                    <strong>{item.name}</strong>
                    <span>{new Date(item.savedAt).toLocaleString('ko-KR')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".html,.htm,text/html"
            onChange={handleLocalFileInput}
          />
        </div>
      </header>
      {actionNotice && (
        <div className={`action-toast ${actionNotice.type}`} role="status">
          <strong>{actionNotice.type === 'error' ? '실패' : actionNotice.type === 'info' ? '진행' : '완료'}</strong>
          <span>{actionNotice.message}</span>
        </div>
      )}

      <main className="app-shell">
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>예약 원본 입력</h2>
          </div>
          <div className="step-nav" role="tablist" aria-label="입력 단계 선택">
            {workflowSteps.map(([id, number, label]) => (
              <button
                key={id}
                className={`step-tab ${activeStep === id ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={activeStep === id}
                onClick={() => setActiveStep(id)}
              >
                <span>{number}</span>
                {label}
              </button>
            ))}
          </div>
          <div className="form-stage">
            {activeStep === 'source' && (
            <Step number="1" title="기본정보 입력">
              <div className="grid grid-2">
                <SearchSelect
                  label="거래처 검색"
                  value={reservation.partnerName}
                  loadOptions={searchPartners}
                  getLabel={(item) => item.name}
                  getMeta={(item) => item.senderName}
                  onSelect={selectPartner}
                  placeholder="거래처명을 입력하세요"
                />
                <SearchSelect
                  label="업체 검색"
                  value={reservation.companyName}
                  loadOptions={searchCompanyInfos}
                  getLabel={(item) => item.name}
                  getMeta={(item) => item.bankAccount}
                  onSelect={selectCompany}
                  placeholder="업체명을 입력하세요"
                />
                <TextInput
                  label="발신"
                  value={reservation.senderName}
                  onChange={(value) => patchField('senderName', value)}
                />
                <TextInput
                  label="입금 계좌"
                  value={reservation.bankAccount}
                  onChange={(value) => patchField('bankAccount', value)}
                />
                <div className="source-stay-group span-2">
                  <TextInput label="예약명" value={reservation.leadGuest} onChange={(value) => patchField('leadGuest', value)} />
                  <div className="passenger-row">
                    <NumberInput label="성인" value={reservation.adultCount} onChange={(value) => patchField('adultCount', value)} />
                    <NumberInput label="아동" value={reservation.childCount} onChange={(value) => patchField('childCount', value)} />
                    <NumberInput label="유아" value={reservation.infantCount} onChange={(value) => patchField('infantCount', value)} />
                  </div>
                </div>
              </div>
            </Step>
            )}

            {activeStep === 'booking' && (
            <Step number="2" title="호텔·예약 기본">
              <div className="grid grid-2">
                <SearchSelect
                  label="호텔 검색"
                  value={reservation.hotelName}
                  loadOptions={searchHotels}
                  getLabel={(item) => item.name}
                  getMeta={(item) => `${item.city || ''} ${item.country || ''}`}
                  onSelect={selectHotel}
                  placeholder="호텔명을 입력하세요"
                />
                <TextInput label="확정번호" value={reservation.confirmNo} onChange={(value) => patchField('confirmNo', value)} />
                <div className="booking-date-row span-2">
                  <Field label="체크인">
                    <input
                      value={reservation.checkIn || ''}
                      inputMode="numeric"
                      placeholder="YYYY-MM-DD 또는 YYYYMMDD"
                      aria-invalid={checkInError ? 'true' : 'false'}
                      onBlur={handleCheckInBlur}
                      onChange={(event) => handleCheckInChange(event.target.value)}
                    />
                    {checkInError && <p className="field-error">{checkInError}</p>}
                  </Field>
                  <Field label="박수">
                    <input
                      ref={nightsInputRef}
                      type="number"
                      min="0"
                      value={reservation.statedNights}
                      onChange={(event) => handleNightsChange(event.target.value)}
                    />
                  </Field>
                  <Field label="체크아웃">
                    <input className="readonly-input" value={reservation.checkOut || ''} placeholder="박수 입력 시 자동 계산" readOnly />
                  </Field>
                </div>
                <div className="stay-time-row span-2">
                  <div className="time-checks">
                    <span>체크인</span>
                    {['14시', '15시'].map((time) => (
                      <label key={time}>
                        <input
                          type="checkbox"
                          checked={reservation.checkInTime === time}
                          onChange={() => toggleTimeField('checkInTime', time)}
                        />
                        {time}
                      </label>
                    ))}
                  </div>
                  <div className="time-checks">
                    <span>체크아웃</span>
                    {['11시', '12시', '18시'].map((time) => (
                      <label key={time}>
                        <input
                          type="checkbox"
                          checked={reservation.checkOutTime === time}
                          onChange={() => toggleTimeField('checkOutTime', time)}
                        />
                        {time}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="room-lines span-2">
                  <div className="room-lines-header">
                    <span>객실 구성</span>
                    <button className="master-add room-line-add" type="button" onClick={addRoomLine} aria-label="객실 구성 추가">
                      +
                    </button>
                  </div>
                  {roomLines.map((line) => (
                    <div className="room-line" key={line.id}>
                      <Field label="객실 타입">
                        <select
                          value={line.roomType || ''}
                          onChange={(event) => updateRoomLine(line.id, { roomType: event.target.value })}
                          disabled={!roomOptions.length}
                        >
                          <option value="">{roomOptions.length ? '객실 타입 선택' : '호텔 마스터 객실 없음'}</option>
                          {roomOptions.map((room) => (
                            <option value={room} key={room}>{room}</option>
                          ))}
                        </select>
                      </Field>
                      <div className="bed-checks" aria-label="침대 타입">
                        <label>
                          <input
                            type="checkbox"
                            checked={line.bedTypes.double}
                            onChange={(event) => updateRoomLineBedType(line.id, 'double', event.target.checked)}
                          />
                          더블
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={line.bedTypes.twin}
                            onChange={(event) => updateRoomLineBedType(line.id, 'twin', event.target.checked)}
                          />
                          트윈
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={line.bedTypes.doubleOrTwin}
                            onChange={(event) => updateRoomLineBedType(line.id, 'doubleOrTwin', event.target.checked)}
                          />
                          더블 OR 트윈
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={line.bedTypes.extraBed}
                            onChange={(event) => updateRoomLineBedType(line.id, 'extraBed', event.target.checked)}
                          />
                          EXTRA BED
                        </label>
                      </div>
                      <NumberInput label="객실 수" value={line.roomCount} onChange={(value) => updateRoomLine(line.id, { roomCount: value })} />
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label="객실 구성 삭제"
                        disabled={roomLines.length <= 1}
                        onClick={() => removeRoomLine(line.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <div className="meal-section span-2">
                  <Field label="식사">
                    <select
                      value={selectedMealOption}
                      onChange={(event) => handleMealPlanOptionChange(event.target.value)}
                    >
                      <option value="">식사 조건 선택</option>
                      {MEAL_OPTIONS.map((option) => (
                        <option value={option} key={option}>{option}</option>
                      ))}
                    </select>
                  </Field>
                  {selectedMealOption === 'Breakfast included+AI' && (
                    <div className="meal-night-grid" aria-label="박수별 식사 구성">
                      {mealPlanDays.map((day, index) => (
                        <div className="meal-night-row" key={`meal-${index}`}>
                          <span>{index + 1}박</span>
                          <label>
                            <input
                              type="checkbox"
                              checked={day.breakfast}
                              onChange={(event) => toggleMealPlanDay(index, 'breakfast', event.target.checked)}
                            />
                            Breakfast
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={day.ai}
                              onChange={(event) => toggleMealPlanDay(index, 'ai', event.target.checked)}
                            />
                            AI
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Step>
            )}

            {activeStep === 'charges' && (
            <Step number="3" title="요금 구성">
              <div className="template-row">
                <button className="btn btn-small" type="button" onClick={() => addCharge('room')}>객실</button>
                <button className="btn btn-small" type="button" onClick={() => addCharge('late')}>레이트</button>
                <button className="btn btn-small" type="button" onClick={() => addCharge('breakfast')}>추가조식</button>
                <button className="btn btn-small" type="button" onClick={() => addCharge('extraBed')}>엑스트라베드</button>
                <button className="btn btn-small" type="button" onClick={() => addCharge('custom')}>기타</button>
              </div>
              <div className="charge-list">
                {reservation.charges.map((line) => (
                  <div className="grid grid-charge charge-row" key={line.id}>
                    <TextInput label="항목" value={line.label} onChange={(value) => updateCharge(line.id, 'label', value)} />
                    <NumberInput label="단가" value={line.unitPrice} onChange={(value) => updateCharge(line.id, 'unitPrice', value)} />
                    <NumberInput label="수량" value={line.quantity} onChange={(value) => updateCharge(line.id, 'quantity', value)} />
                    <NumberInput label="박수" value={line.nights} onChange={(value) => updateCharge(line.id, 'nights', value)} />
                    <button className="icon-btn" type="button" aria-label="요금 라인 삭제" onClick={() => removeCharge(line.id)}>
                      x
                    </button>
                  </div>
                ))}
              </div>
            </Step>
            )}

            {activeStep === 'settlement' && (
            <Step number="4" title="정산·안내">
              <div className="settlement-note">
                <div className="settlement-note-head">
                  <strong>문서 안내 항목</strong>
                  <button className="icon-btn add-btn" type="button" aria-label="안내 항목 추가" onClick={addNoticeItem}>
                    +
                  </button>
                </div>
                {noticeItems.map((item, index) => (
                  <div className="notice-item-editor" key={item.id}>
                    <div className="notice-item-toolbar">
                      <span>안내 항목 {index + 1}</span>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.invoice}
                          onChange={(event) => updateNoticeItem(item.id, { invoice: event.target.checked })}
                        />
                        인보이스
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.confirmation}
                          onChange={(event) => updateNoticeItem(item.id, { confirmation: event.target.checked })}
                        />
                        바우처
                      </label>
                      <button className="icon-btn" type="button" aria-label="안내 항목 삭제" onClick={() => removeNoticeItem(item.id)}>
                        x
                      </button>
                    </div>
                    <button className="phrase-load-button" type="button" onClick={() => openPhrasePicker(item.id)}>
                      {item.title || 'DB 문구 검색/불러오기'}
                    </button>
                    <textarea
                      value={item.content}
                      onChange={(event) => updateNoticeItem(item.id, { content: event.target.value })}
                      placeholder="선택한 문서에 표시할 안내 내용을 입력하세요."
                    />
                  </div>
                ))}
              </div>
            </Step>
            )}
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="preview-header">
            <div className="tabs" role="tablist" aria-label="문서 미리보기 선택">
              {tabs.map(([id, label]) => (
                <button
                  className={`tab ${activeTab === id ? 'active' : ''}`}
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setActiveTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="preview-canvas">
            <DocumentPreview
              tab={activeTab}
              reservation={reservation}
              foreignTotal={foreignTotal}
              krwTotal={krwTotal}
            />
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel summary-panel">
            <div className="side-body">
              <div className="audit-summary">
                <div className="audit-meta-row">
                  <Metric label="예약자명" value={reservation.leadGuest || '-'} compact />
                  <Metric label="체크인날짜" value={reservation.checkIn || '-'} compact />
                  <Metric label="박수" value={`${autoNights}박`} compact />
                </div>
                <Metric
                  label="청구액"
                  value={`${money(foreignTotal, reservation.currency)} / ${krw(krwTotal)}`}
                  wide
                />
              </div>
              <button className="btn btn-primary audit-pdf-btn" type="button" onClick={() => window.print()}>
                PDF 파일
              </button>
            </div>
          </section>
        </aside>
      </main>
      {phrasePickerOpen && (
        <div className="phrase-picker-overlay" role="dialog" aria-modal="true" aria-label="자주쓰는 문구 불러오기">
          <div className="phrase-picker-modal">
            <header className="phrase-picker-header">
              <h2>자주쓰는 문구 불러오기</h2>
              <button type="button" aria-label="닫기" onClick={() => setPhrasePickerOpen(false)}>×</button>
            </header>
            <input
              className="phrase-picker-search"
              value={phraseQuery}
              onChange={(event) => setPhraseQuery(event.target.value)}
              placeholder="이름으로 검색..."
              autoFocus
            />
            <div className="phrase-picker-list">
              {filteredPhraseSnippets.map((phrase) => (
                <button type="button" key={phrase.id} onClick={() => applyPhraseSnippet(phrase.id)}>
                  {phrase.title || '자주쓰는 문구'}
                </button>
              ))}
              {phraseSnippets.length > 0 && filteredPhraseSnippets.length === 0 && (
                <p>검색 결과가 없습니다.</p>
              )}
              {phraseSnippets.length === 0 && (
                <p>마스터 관리에서 자주쓰는 문구를 먼저 등록하세요.</p>
              )}
            </div>
            <footer className="phrase-picker-actions">
              <button
                className="btn btn-small"
                type="button"
                onClick={() => {
                  setPhrasePickerOpen(false);
                  setMasterInitialTab('phrases');
                  setMasterOpen(true);
                }}
              >
                ↗ 자주쓰는 문구 관리
              </button>
              <button className="btn btn-small" type="button" onClick={() => setPhrasePickerOpen(false)}>닫기</button>
            </footer>
          </div>
        </div>
      )}
      {masterOpen && (
        <MasterDataManager
          initialTab={masterInitialTab}
          onClose={() => setMasterOpen(false)}
          onDataChange={handleMasterDataChange}
        />
      )}
    </>
  );
}

function MasterDataManager({ initialTab = 'hotels', onClose, onDataChange }) {
  const ciInputId = useId();
  const hotelViInputId = useId();
  const companyCiInputId = useId();
  const companySealInputId = useId();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [partners, setPartners] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);
  const [companyInfos, setCompanyInfos] = useState([]);
  const [phraseSnippets, setPhraseSnippets] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedPhraseId, setSelectedPhraseId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newHotelEnglish, setNewHotelEnglish] = useState('');
  const [newHotelKorean, setNewHotelKorean] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [newPartner, setNewPartner] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newPhraseTitle, setNewPhraseTitle] = useState('');
  const [isCiDragging, setIsCiDragging] = useState(false);
  const [isHotelViDragging, setIsHotelViDragging] = useState(false);
  const [isCompanyCiDragging, setIsCompanyCiDragging] = useState(false);
  const [isCompanySealDragging, setIsCompanySealDragging] = useState(false);
  const [masterState, setMasterState] = useState('불러오는 중');

  const selectedCountry = countries.find((country) => country.id === selectedCountryId);
  const visibleRegions = regions.filter((region) => region.countryId === selectedCountryId);
  const selectedRegion = regions.find((region) => region.id === selectedRegionId);
  const visibleHotels = hotels.filter((hotel) => hotel.country === selectedCountry?.name && hotel.city === selectedRegion?.name);
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId) || visibleHotels[0] || hotels[0];
  const selectedPartner = partners.find((partner) => partner.id === selectedPartnerId) || partners[0];
  const selectedCompany = companyInfos.find((company) => company.id === selectedCompanyId) || companyInfos[0] || emptyCompanyInfo();
  const selectedPhrase = phraseSnippets.find((phrase) => phrase.id === selectedPhraseId) || phraseSnippets[0] || emptyPhraseSnippet();
  const rooms = selectedHotel?.rooms || [];

  useEffect(() => {
    let ignore = false;
    Promise.all([
      listPartners(),
      listHotels(),
      listCountries(),
      listRegions(),
      listCompanyInfos(),
      listPhraseSnippets(),
      listExchangeRates(),
    ])
      .then(([partnerRows, hotelRows, countryRows, regionRows, companyRows, phraseRows, exchangeRateRows]) => {
        if (ignore) return;
        setPartners(partnerRows);
        setHotels(hotelRows);
        setCountries(countryRows);
        setRegions(regionRows);
        setCompanyInfos(companyRows);
        setPhraseSnippets(phraseRows);
        setExchangeRates(exchangeRateRows);
        setSelectedCompanyId(companyRows[0]?.id || '');
        setSelectedPhraseId(phraseRows[0]?.id || '');
        setSelectedPartnerId(partnerRows[0]?.id || '');
        setSelectedCountryId(countryRows[0]?.id || '');
        setSelectedRegionId(regionRows.find((region) => region.countryId === countryRows[0]?.id)?.id || '');
        setSelectedHotelId('');
        setMasterState('Supabase 연결 완료');
      })
      .catch((error) => {
        console.error(error);
        if (!ignore) setMasterState('Supabase 데이터를 불러오지 못했습니다');
      });
    return () => {
      ignore = true;
    };
  }, []);

  function addCountry() {
    const trimmed = newCountry.trim();
    if (!trimmed) return;
    const existing = countries.find((country) => country.name === trimmed);
    if (existing) {
      setSelectedCountryId(existing.id);
      setNewCountry('');
      return;
    }
    setMasterState('국가 저장 중');
    createCountry(trimmed)
      .then((saved) => {
        setCountries((current) => [...current, saved]);
        setSelectedCountryId(saved.id);
        setSelectedRegionId('');
        setNewCountry('');
        setMasterState('국가 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('국가 저장 실패');
      });
  }

  function renameCountry(country) {
    const name = window.prompt('국가명을 수정하세요.', country.name)?.trim();
    if (!name || name === country.name) return;
    if (countries.some((item) => item.id !== country.id && item.name === name)) {
      setMasterState('이미 같은 국가명이 있습니다');
      return;
    }
    const previousName = country.name;
    setMasterState('국가 수정 중');
    updateCountry({ ...country, name })
      .then((saved) => {
        const hotelUpdates = hotels
          .filter((hotel) => hotel.country === previousName)
          .map((hotel) => ({ ...hotel, country: saved.name }));
        setCountries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setHotels((current) => current.map((hotel) => (
          hotel.country === previousName ? { ...hotel, country: saved.name } : hotel
        )));
        setSelectedCountryId(saved.id);
        setMasterState('국가 수정 완료');
        return Promise.all(hotelUpdates.map(updateHotel));
      })
      .then((savedHotels) => {
        if (!savedHotels?.length) return;
        setHotels((current) => current.map((hotel) => (
          savedHotels.find((saved) => saved.id === hotel.id) || hotel
        )));
      })
      .catch((error) => {
        console.error(error);
        setMasterState('국가 수정 실패');
      });
  }

  function removeCountry(country) {
    const confirmed = window.confirm(`${country.name} 국가를 삭제할까요?\n연결된 지역도 함께 삭제됩니다.`);
    if (!confirmed) return;
    setMasterState('국가 삭제 중');
    deleteCountry(country.id)
      .then(() => {
        const nextCountries = countries.filter((item) => item.id !== country.id);
        const nextCountryId = nextCountries[0]?.id || '';
        const nextRegions = regions.filter((region) => region.countryId !== country.id);
        const nextRegionId = nextRegions.find((region) => region.countryId === nextCountryId)?.id || '';
        setCountries(nextCountries);
        setRegions(nextRegions);
        setSelectedCountryId(nextCountryId);
        setSelectedRegionId(nextRegionId);
        setSelectedHotelId('');
        setMasterState('국가 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('국가 삭제 실패');
      });
  }

  function addCity() {
    const trimmed = newCity.trim();
    if (!trimmed || !selectedCountryId) return;
    const existing = regions.find((region) => region.countryId === selectedCountryId && region.name === trimmed);
    if (existing) {
      setSelectedRegionId(existing.id);
      setNewCity('');
      return;
    }
    setMasterState('지역 저장 중');
    createRegion(selectedCountryId, trimmed)
      .then((saved) => {
        setRegions((current) => [...current, saved]);
        setSelectedRegionId(saved.id);
        setNewCity('');
        setMasterState('지역 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('지역 저장 실패');
      });
  }

  function renameRegion(region) {
    const name = window.prompt('지역명을 수정하세요.', region.name)?.trim();
    if (!name || name === region.name) return;
    if (regions.some((item) => item.id !== region.id && item.countryId === region.countryId && item.name === name)) {
      setMasterState('이미 같은 지역명이 있습니다');
      return;
    }
    const previousName = region.name;
    setMasterState('지역 수정 중');
    updateRegion({ ...region, name })
      .then((saved) => {
        const hotelUpdates = hotels
          .filter((hotel) => hotel.country === selectedCountry?.name && hotel.city === previousName)
          .map((hotel) => ({ ...hotel, city: saved.name }));
        setRegions((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setHotels((current) => current.map((hotel) => (
          hotel.country === selectedCountry?.name && hotel.city === previousName ? { ...hotel, city: saved.name } : hotel
        )));
        setSelectedRegionId(saved.id);
        setMasterState('지역 수정 완료');
        return Promise.all(hotelUpdates.map(updateHotel));
      })
      .then((savedHotels) => {
        if (!savedHotels?.length) return;
        setHotels((current) => current.map((hotel) => (
          savedHotels.find((saved) => saved.id === hotel.id) || hotel
        )));
      })
      .catch((error) => {
        console.error(error);
        setMasterState('지역 수정 실패');
      });
  }

  function removeRegion(region) {
    const confirmed = window.confirm(`${region.name} 지역을 삭제할까요?`);
    if (!confirmed) return;
    setMasterState('지역 삭제 중');
    deleteRegion(region.id)
      .then(() => {
        setRegions((current) => {
          const next = current.filter((item) => item.id !== region.id);
          setSelectedRegionId(next.find((item) => item.countryId === selectedCountryId)?.id || '');
          return next;
        });
        setSelectedHotelId('');
        setMasterState('지역 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('지역 삭제 실패');
      });
  }

  function addHotel() {
    const name = newHotelEnglish.trim();
    if (!name) return;
    const hotel = {
      id: makeId(),
      name,
      koreanName: newHotelKorean.trim(),
      country: selectedCountry?.name || '',
      city: selectedRegion?.name || '',
      address: '',
      phone: '',
      logoUrl: '',
      defaultNotice: '',
      defaultMealPlan: '',
      defaultCheckInTime: '',
      defaultCheckOutTime: '',
      rooms: [],
    };
    setMasterState('호텔 저장 중');
    createHotel(hotel)
      .then((saved) => {
        setHotels((current) => [...current, saved]);
        setSelectedHotelId(saved.id);
        setNewHotelEnglish('');
        setNewHotelKorean('');
        setMasterState('호텔 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('호텔 저장 실패');
      });
  }

  function updateSelectedHotel(changes) {
    if (!selectedHotel) return;
    setHotels((current) => current.map((hotel) => (hotel.id === selectedHotel.id ? { ...hotel, ...changes } : hotel)));
  }

  function toggleSelectedHotelTime(key, value) {
    if (!selectedHotel) return;
    updateSelectedHotel({ [key]: selectedHotel[key] === value ? '' : value });
  }

  function renameHotel(hotel) {
    const koreanName = window.prompt('호텔 한글명을 수정하세요.', hotel.koreanName || hotel.name)?.trim();
    if (koreanName === undefined || !koreanName) return;
    const name = window.prompt('호텔 영문명을 수정하세요.', hotel.name)?.trim();
    if (!name) return;
    const nextHotel = { ...hotel, koreanName, name };
    setMasterState('호텔 수정 중');
    updateHotel(nextHotel)
      .then((saved) => {
        setHotels((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setSelectedHotelId(saved.id);
        setMasterState('호텔 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState(String(error?.message || error).includes('default_check_') ? '호텔 수정 실패 - DB 컬럼을 먼저 추가해 주세요' : '호텔 수정 실패');
      });
  }

  function addRoom() {
    const trimmed = newRoom.trim();
    if (!trimmed || !selectedHotel) return;
    const nextHotel = { ...selectedHotel, rooms: [...rooms, trimmed] };
    updateSelectedHotel({ rooms: nextHotel.rooms });
    setNewRoom('');
    setMasterState('객실 저장 중');
    updateHotel(nextHotel)
      .then((saved) => {
        setHotels((current) => current.map((hotel) => (hotel.id === saved.id ? saved : hotel)));
        setMasterState('객실 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('객실 저장 실패');
      });
  }

  function renameRoom(index) {
    if (!selectedHotel) return;
    const name = window.prompt('객실명을 수정하세요.', rooms[index])?.trim();
    if (!name || name === rooms[index]) return;
    const nextRooms = rooms.map((room, roomIndex) => (roomIndex === index ? name : room));
    const nextHotel = { ...selectedHotel, rooms: nextRooms };
    updateSelectedHotel({ rooms: nextRooms });
    setMasterState('객실 수정 중');
    updateHotel(nextHotel)
      .then((saved) => {
        setHotels((current) => current.map((hotel) => (hotel.id === saved.id ? saved : hotel)));
        setMasterState('객실 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('객실 수정 실패');
      });
  }

  function removeRoom(index) {
    if (!selectedHotel) return;
    const nextRooms = rooms.filter((_, roomIndex) => roomIndex !== index);
    const nextHotel = { ...selectedHotel, rooms: nextRooms };
    updateSelectedHotel({ rooms: nextRooms });
    setMasterState('객실 삭제 중');
    updateHotel(nextHotel)
      .then((saved) => {
        setHotels((current) => current.map((hotel) => (hotel.id === saved.id ? saved : hotel)));
        setMasterState('객실 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('객실 삭제 실패');
      });
  }

  function addPartner() {
    const trimmed = newPartner.trim();
    if (!trimmed) return;
    const partner = {
      id: makeId(),
      name: trimmed,
      ciUrl: '',
      recipientName: trimmed,
      senderName: '',
      bankAccount: '',
      invoiceRemark: '',
      paymentTerms: '',
    };
    setMasterState('여행사 저장 중');
    createPartner(partner)
      .then((saved) => {
        setPartners((current) => [...current, saved]);
        setSelectedPartnerId(saved.id);
        setNewPartner('');
        setMasterState('여행사 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('여행사 저장 실패');
      });
  }

  function updateSelectedPartner(changes) {
    if (!selectedPartner) return;
    setPartners((current) => current.map((partner) => (
      partner.id === selectedPartner.id ? { ...partner, ...changes } : partner
    )));
  }

  function saveSelectedPartner() {
    if (!selectedPartner) return;
    setMasterState('여행사 수정 중');
    updatePartner(selectedPartner)
      .then((saved) => {
        setPartners((current) => current.map((partner) => (partner.id === saved.id ? saved : partner)));
        onDataChange?.('partner', saved);
        setMasterState('여행사 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('여행사 수정 실패');
      });
  }

  function deleteSelectedPartner() {
    if (!selectedPartner) return;
    const confirmed = window.confirm(`${selectedPartner.name} 여행사를 삭제할까요?`);
    if (!confirmed) return;
    setMasterState('여행사 삭제 중');
    deletePartner(selectedPartner.id)
      .then(() => {
        setPartners((current) => {
          const next = current.filter((partner) => partner.id !== selectedPartner.id);
          setSelectedPartnerId(next[0]?.id || '');
          return next;
        });
        setMasterState('여행사 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('여행사 삭제 실패');
      });
  }

  function loadPartnerCi(file) {
    if (!file || !file.type.startsWith('image/') || !selectedPartner) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateSelectedPartner({ ciUrl: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
  }

  function handlePartnerCiDrop(event) {
    event.preventDefault();
    setIsCiDragging(false);
    loadPartnerCi(event.dataTransfer.files?.[0]);
  }

  function loadHotelVi(file) {
    if (!file || !file.type.startsWith('image/') || !selectedHotel) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateSelectedHotel({ logoUrl: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
  }

  function handleHotelViDrop(event) {
    event.preventDefault();
    setIsHotelViDragging(false);
    loadHotelVi(event.dataTransfer.files?.[0]);
  }

  function updateSelectedCompany(changes) {
    if (!selectedCompany.id) return;
    setCompanyInfos((current) => current.map((company) => (
      company.id === selectedCompany.id ? { ...company, ...changes } : company
    )));
  }

  function addCompanyInfo() {
    const name = newCompanyName.trim();
    if (!name) return;
    const company = { ...emptyCompanyInfo(), id: makeId(), name };
    setMasterState('업체 정보 저장 중');
    createCompanyInfo(company)
      .then((saved) => {
        setCompanyInfos((current) => [...current, saved]);
        setSelectedCompanyId(saved.id);
        setNewCompanyName('');
        setMasterState('업체 정보 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('업체 정보 저장 실패');
      });
  }

  function renameCompanyInfo(company) {
    const name = window.prompt('업체 이름을 수정하세요.', company.name || '업체 정보')?.trim();
    if (!name || name === company.name) return;
    setMasterState('업체 이름 수정 중');
    updateCompanyInfo({ ...company, name })
      .then((saved) => {
        setCompanyInfos((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setSelectedCompanyId(saved.id);
        setMasterState('업체 이름 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('업체 이름 수정 실패');
      });
  }

  function removeCompanyInfo(company) {
    const confirmed = window.confirm(`${company.name || '업체 정보'} 항목을 삭제할까요?`);
    if (!confirmed) return;
    setMasterState('업체 정보 삭제 중');
    deleteCompanyInfo(company.id)
      .then(() => {
        const next = companyInfos.filter((item) => item.id !== company.id);
        setCompanyInfos(next);
        setSelectedCompanyId(next[0]?.id || '');
        setMasterState('업체 정보 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('업체 정보 삭제 실패');
      });
  }

  function saveCompanySettings() {
    if (!selectedCompany.id) return;
    setMasterState('업체 정보 저장 중');
    updateCompanyInfo(selectedCompany)
      .then((saved) => {
        setCompanyInfos((current) => current.map((company) => (company.id === saved.id ? saved : company)));
        onDataChange?.('company', saved);
        setMasterState('업체 정보 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('업체 정보 저장 실패');
      });
  }

  function loadCompanyImage(file, key) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateSelectedCompany({ [key]: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
  }

  function handleCompanyCiDrop(event) {
    event.preventDefault();
    setIsCompanyCiDragging(false);
    loadCompanyImage(event.dataTransfer.files?.[0], 'ciUrl');
  }

  function handleCompanySealDrop(event) {
    event.preventDefault();
    setIsCompanySealDragging(false);
    loadCompanyImage(event.dataTransfer.files?.[0], 'sealUrl');
  }

  function updateSelectedPhrase(changes) {
    if (!selectedPhrase.id) return;
    setPhraseSnippets((current) => current.map((phrase) => (
      phrase.id === selectedPhrase.id ? { ...phrase, ...changes } : phrase
    )));
  }

  function addPhraseSnippet() {
    const title = newPhraseTitle.trim();
    if (!title) return;
    const phrase = { ...emptyPhraseSnippet(), id: makeId(), title };
    setMasterState('문구 저장 중');
    createPhraseSnippet(phrase)
      .then((saved) => {
        setPhraseSnippets((current) => [...current, saved]);
        setSelectedPhraseId(saved.id);
        setNewPhraseTitle('');
        setMasterState('문구 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('문구 저장 실패');
      });
  }

  function renamePhraseSnippet(phrase) {
    const title = window.prompt('문구 제목을 수정하세요.', phrase.title || '자주쓰는 문구')?.trim();
    if (!title || title === phrase.title) return;
    setMasterState('문구 제목 수정 중');
    updatePhraseSnippet({ ...phrase, title })
      .then((saved) => {
        setPhraseSnippets((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setSelectedPhraseId(saved.id);
        setMasterState('문구 제목 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('문구 제목 수정 실패');
      });
  }

  function saveSelectedPhrase() {
    if (!selectedPhrase.id) return;
    setMasterState('문구 수정 중');
    updatePhraseSnippet(selectedPhrase)
      .then((saved) => {
        setPhraseSnippets((current) => current.map((phrase) => (phrase.id === saved.id ? saved : phrase)));
        setMasterState('문구 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('문구 수정 실패');
      });
  }

  function removePhraseSnippet(phrase) {
    const confirmed = window.confirm(`${phrase.title || '자주쓰는 문구'} 항목을 삭제할까요?`);
    if (!confirmed) return;
    setMasterState('문구 삭제 중');
    deletePhraseSnippet(phrase.id)
      .then(() => {
        const next = phraseSnippets.filter((item) => item.id !== phrase.id);
        setPhraseSnippets(next);
        setSelectedPhraseId(next[0]?.id || '');
        setMasterState('문구 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('문구 삭제 실패');
      });
  }

  function saveSelectedHotel() {
    if (!selectedHotel) return;
    setMasterState('호텔 수정 중');
    updateHotel(selectedHotel)
      .then((saved) => {
        setHotels((current) => current.map((hotel) => (hotel.id === saved.id ? saved : hotel)));
        onDataChange?.('hotel', saved);
        setMasterState('호텔 수정 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('호텔 수정 실패');
      });
  }

  function deleteSelectedHotel(targetHotel = selectedHotel) {
    if (!targetHotel) return;
    const confirmed = window.confirm(`${targetHotel.koreanName || targetHotel.name} 호텔을 삭제할까요?`);
    if (!confirmed) return;
    setMasterState('호텔 삭제 중');
    deleteHotel(targetHotel.id)
      .then(() => {
        setHotels((current) => {
          const next = current.filter((hotel) => hotel.id !== targetHotel.id);
          const nextHotel = next.find((hotel) => hotel.country === selectedCountry?.name && hotel.city === selectedRegion?.name) || next[0];
          const nextCountry = countries.find((country) => country.name === nextHotel?.country);
          const nextRegion = regions.find((region) => region.countryId === nextCountry?.id && region.name === nextHotel?.city);
          setSelectedCountryId(nextCountry?.id || '');
          setSelectedRegionId(nextRegion?.id || '');
          setSelectedHotelId(nextHotel?.id || '');
          return next;
        });
        setMasterState('호텔 삭제 완료');
      })
      .catch((error) => {
        console.error(error);
        setMasterState('호텔 삭제 실패');
      });
  }

  const tabs = [
    ['hotels', '호텔 정보'],
    ['partners', '여행사'],
    ['company', '업체 정보'],
    ['phrases', '자주쓰는 문구 DB'],
    ['exchangeRates', '환율'],
  ];

  return (
    <div className="master-overlay" role="dialog" aria-modal="true" aria-label="마스터 데이터 관리">
      <div className="master-window">
        <header className="master-header">
          <div>
            <span className="master-icon">▣</span>
            <h2>마스터 데이터 관리</h2>
            <span className="master-state">{masterState}</span>
          </div>
          <button className="master-close" type="button" onClick={onClose} aria-label="마스터 데이터 관리 닫기">
            ×
          </button>
        </header>

        <nav className="master-tabs" aria-label="마스터 데이터 종류">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? 'active' : ''}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'partners' && (
          <section className="master-agency-grid">
            <div className="master-card agency-list-card">
              <header>여행사 목록</header>
              <div className="agency-list">
                {partners.map((partner) => (
                  <button
                    className={`agency-row ${selectedPartner?.id === partner.id ? 'active' : ''}`}
                    key={partner.id}
                    type="button"
                    onClick={() => setSelectedPartnerId(partner.id)}
                  >
                    <span>
                      {partner.ciUrl ? <img src={partner.ciUrl} alt="" /> : partner.name.slice(0, 4).toUpperCase()}
                    </span>
                    <strong>{partner.name}</strong>
                  </button>
                ))}
              </div>
              <footer>
                <input value={newPartner} onChange={(event) => setNewPartner(event.target.value)} placeholder="여행사명" />
                <button className="master-add" type="button" onClick={addPartner}>+</button>
              </footer>
            </div>

            <div className="master-card agency-detail-card">
              <header>여행사 상세 정보</header>
              <div className="agency-detail-body">
                <label
                  className={`logo-box ${isCiDragging ? 'dragging' : ''} ${selectedPartner?.ciUrl ? 'has-image' : ''}`}
                  htmlFor={ciInputId}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsCiDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsCiDragging(false)}
                  onDrop={handlePartnerCiDrop}
                >
                  <input
                    id={ciInputId}
                    type="file"
                    accept="image/*"
                    onChange={(event) => loadPartnerCi(event.target.files?.[0])}
                  />
                  {selectedPartner?.ciUrl ? <img src={selectedPartner.ciUrl} alt="" /> : <span>CI</span>}
                </label>
                <Field label="여행사명">
                  <input
                    value={selectedPartner?.name || ''}
                    onChange={(event) => updateSelectedPartner({
                      name: event.target.value,
                      recipientName: event.target.value,
                    })}
                  />
                </Field>
                <div className="detail-actions">
                  <button className="btn btn-primary btn-small" type="button" onClick={saveSelectedPartner}>수정</button>
                  <button className="btn btn-danger btn-small" type="button" onClick={deleteSelectedPartner}>삭제</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'company' && (
          <section className="master-agency-grid master-company-grid">
            <div className="master-card company-list-card">
              <header>업체 정보 목록</header>
              <div className="agency-list">
                {companyInfos.map((company) => (
                  <div
                    className={`company-row ${selectedCompany.id === company.id ? 'active' : ''}`}
                    key={company.id}
                  >
                    <button type="button" className="company-row-main" onClick={() => setSelectedCompanyId(company.id)}>
                      <span>
                        {company.ciUrl ? <img src={company.ciUrl} alt="" /> : 'CI'}
                      </span>
                      <strong>{company.name || '업체 정보'}</strong>
                    </button>
                    <div className="master-row-actions">
                      <button type="button" onClick={() => renameCompanyInfo(company)}>수정</button>
                      <button type="button" className="danger" onClick={() => removeCompanyInfo(company)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
              <footer>
                <input
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  placeholder="업체 이름"
                />
                <button className="master-add" type="button" onClick={addCompanyInfo}>+</button>
              </footer>
            </div>

            <div className="master-card company-info-card">
              <header>업체 상세 정보</header>
              <div className="company-info-body">
                <div className="company-image-grid">
                  <Field label="CI">
                    <label
                      className={`logo-box company-image-dropzone ${isCompanyCiDragging ? 'dragging' : ''} ${selectedCompany.ciUrl ? 'has-image' : ''}`}
                      htmlFor={companyCiInputId}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsCompanyCiDragging(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setIsCompanyCiDragging(false)}
                      onDrop={handleCompanyCiDrop}
                    >
                      <input
                        id={companyCiInputId}
                        type="file"
                        accept="image/*"
                        onChange={(event) => loadCompanyImage(event.target.files?.[0], 'ciUrl')}
                      />
                      {selectedCompany.ciUrl ? <img src={selectedCompany.ciUrl} alt="" /> : <span>CI</span>}
                    </label>
                  </Field>
                  <Field label="직인">
                    <label
                      className={`logo-box company-image-dropzone ${isCompanySealDragging ? 'dragging' : ''} ${selectedCompany.sealUrl ? 'has-image' : ''}`}
                      htmlFor={companySealInputId}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsCompanySealDragging(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setIsCompanySealDragging(false)}
                      onDrop={handleCompanySealDrop}
                    >
                      <input
                        id={companySealInputId}
                        type="file"
                        accept="image/*"
                        onChange={(event) => loadCompanyImage(event.target.files?.[0], 'sealUrl')}
                      />
                      {selectedCompany.sealUrl ? <img src={selectedCompany.sealUrl} alt="" /> : <span>직인</span>}
                    </label>
                  </Field>
                </div>
                <Field label="주소">
                  <textarea
                    value={selectedCompany.address}
                    onChange={(event) => updateSelectedCompany({ address: event.target.value })}
                  />
                </Field>
                <div className="company-field-grid">
                  <Field label="전화번호">
                    <input
                      value={selectedCompany.phone}
                      onChange={(event) => updateSelectedCompany({ phone: event.target.value })}
                    />
                  </Field>
                  <Field label="이메일주소">
                    <input
                      type="email"
                      value={selectedCompany.email}
                      onChange={(event) => updateSelectedCompany({ email: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="계좌번호">
                  <input
                    value={selectedCompany.bankAccount}
                    onChange={(event) => updateSelectedCompany({ bankAccount: event.target.value })}
                  />
                </Field>
                <div className="detail-actions company-actions">
                  <button className="btn btn-primary btn-small" type="button" onClick={saveCompanySettings}>저장</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'phrases' && (
          <section className="master-agency-grid master-phrase-grid">
            <div className="master-card phrase-list-card">
              <header>자주쓰는 문구 목록</header>
              <div className="master-list">
                {phraseSnippets.map((phrase) => (
                  <div
                    className={`master-row phrase-row ${selectedPhrase.id === phrase.id ? 'active' : ''}`}
                    key={phrase.id}
                  >
                    <button type="button" className="master-row-main" onClick={() => setSelectedPhraseId(phrase.id)}>
                      <strong>{phrase.title || '자주쓰는 문구'}</strong>
                    </button>
                    <div className="master-row-actions">
                      <button type="button" onClick={() => renamePhraseSnippet(phrase)}>수정</button>
                      <button type="button" className="danger" onClick={() => removePhraseSnippet(phrase)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
              <footer>
                <input
                  value={newPhraseTitle}
                  onChange={(event) => setNewPhraseTitle(event.target.value)}
                  placeholder="문구 제목"
                />
                <button className="master-add" type="button" onClick={addPhraseSnippet}>+</button>
              </footer>
            </div>

            <div className="master-card phrase-detail-card">
              <header>문구 상세 정보</header>
              <div className="phrase-detail-body">
                <Field label="문구 제목">
                  <input
                    value={selectedPhrase.title}
                    onChange={(event) => updateSelectedPhrase({ title: event.target.value })}
                  />
                </Field>
                <Field label="문구 내용">
                  <textarea
                    value={selectedPhrase.content}
                    onChange={(event) => updateSelectedPhrase({ content: event.target.value })}
                  />
                </Field>
                <div className="detail-actions phrase-actions">
                  <button className="btn btn-primary btn-small" type="button" onClick={saveSelectedPhrase}>저장</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'exchangeRates' && (
          <section className="master-rate-grid">
            <div className="master-card rate-list-card">
              <header>환율 저장 이력</header>
              <div className="rate-list">
                {exchangeRates.length === 0 && (
                  <div className="rate-empty">저장된 환율 정보가 없습니다.</div>
                )}
                {exchangeRates.map((rate) => (
                  <div className="rate-row" key={rate.id}>
                    <strong>{rate.exchangeDate}</strong>
                    <span>{rate.currency} {Number(rate.rate || 0).toLocaleString('ko-KR')}</span>
                    <em>{formatDateTime(rate.savedAt)}</em>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'hotels' && (
          <section className="master-hotel-grid">
            <MasterColumn
              title="국가"
              items={countries}
              getKey={(country) => country.id}
              getLabel={(country) => country.name}
              active={selectedCountryId}
              onSelect={(country) => {
                setSelectedCountryId(country.id);
                const nextRegion = regions.find((region) => region.countryId === country.id);
                setSelectedRegionId(nextRegion?.id || '');
                setSelectedHotelId('');
              }}
              inputValue={newCountry}
              inputPlaceholder="국가 추가"
              onInput={setNewCountry}
              onAdd={addCountry}
              onRename={renameCountry}
              onDelete={removeCountry}
            />
            <MasterColumn
              title="지역"
              items={visibleRegions}
              getKey={(region) => region.id}
              getLabel={(region) => region.name}
              active={selectedRegionId}
              onSelect={(region) => {
                setSelectedRegionId(region.id);
                setSelectedHotelId(hotels.find((hotel) => hotel.country === selectedCountry?.name && hotel.city === region.name)?.id || '');
              }}
              inputValue={newCity}
              inputPlaceholder="지역 추가"
              onInput={setNewCity}
              onAdd={addCity}
              onRename={renameRegion}
              onDelete={removeRegion}
            />
            <div className="master-card hotel-list-card">
              <header>호텔</header>
              <div className="hotel-list">
                {visibleHotels.map((hotel) => (
                  <div
                    key={hotel.id}
                    className={`master-row hotel-row ${selectedHotel?.id === hotel.id ? 'active' : ''}`}
                  >
                    <button type="button" className="master-row-main" onClick={() => setSelectedHotelId(hotel.id)}>
                      <strong>{hotel.name}</strong>
                      <span>{hotel.koreanName || hotel.name}</span>
                    </button>
                    <div className="master-row-actions">
                      <button type="button" onClick={() => renameHotel(hotel)}>수정</button>
                      <button type="button" className="danger" onClick={() => deleteSelectedHotel(hotel)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
              <footer className="hotel-add">
                <input value={newHotelKorean} onChange={(event) => setNewHotelKorean(event.target.value)} placeholder="한글명" />
                <input value={newHotelEnglish} onChange={(event) => setNewHotelEnglish(event.target.value)} placeholder="영문명" />
                <button className="master-add" type="button" onClick={addHotel}>+</button>
              </footer>
            </div>

            <div className="master-detail">
              <div className="master-card hotel-detail-card">
                <header>호텔 상세 정보</header>
                <div className="hotel-detail-body">
                  <label
                    className={`logo-box vi-dropzone ${isHotelViDragging ? 'dragging' : ''} ${selectedHotel?.logoUrl ? 'has-image' : ''}`}
                    htmlFor={hotelViInputId}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsHotelViDragging(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setIsHotelViDragging(false)}
                    onDrop={handleHotelViDrop}
                  >
                    <input
                      id={hotelViInputId}
                      type="file"
                      accept="image/*"
                      onChange={(event) => loadHotelVi(event.target.files?.[0])}
                    />
                    {selectedHotel?.logoUrl ? <img src={selectedHotel.logoUrl} alt="" /> : <span>VI</span>}
                  </label>
                  <Field label="호텔 주소">
                    <textarea
                      value={selectedHotel?.address || ''}
                      onChange={(event) => updateSelectedHotel({ address: event.target.value })}
                    />
                  </Field>
                  <Field label="전화번호">
                    <input
                      value={selectedHotel?.phone || ''}
                      onChange={(event) => updateSelectedHotel({ phone: event.target.value })}
                    />
                  </Field>
                  <div className="detail-actions">
                    <button className="btn btn-primary btn-small" type="button" onClick={saveSelectedHotel}>수정</button>
                    <button className="btn btn-danger btn-small" type="button" onClick={deleteSelectedHotel}>삭제</button>
                  </div>
                </div>
              </div>
              <div className="master-card hotel-time-card">
                <header>체크인·체크아웃</header>
                <div className="hotel-time-body">
                  <div className="time-checks master-time-checks">
                    <span>체크인</span>
                    {['14시', '15시'].map((time) => (
                      <label key={time}>
                        <input
                          type="checkbox"
                          checked={selectedHotel?.defaultCheckInTime === time}
                          onChange={() => toggleSelectedHotelTime('defaultCheckInTime', time)}
                        />
                        {time}
                      </label>
                    ))}
                  </div>
                  <div className="time-checks master-time-checks">
                    <span>체크아웃</span>
                    {['11시', '12시', '18시'].map((time) => (
                      <label key={time}>
                        <input
                          type="checkbox"
                          checked={selectedHotel?.defaultCheckOutTime === time}
                          onChange={() => toggleSelectedHotelTime('defaultCheckOutTime', time)}
                        />
                        {time}
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-small" type="button" onClick={saveSelectedHotel}>저장</button>
                </div>
              </div>
              <div className="master-card room-card">
                <header>객실</header>
                <div className="room-list">
                  {rooms.map((room, index) => (
                    <div className="room-row" key={`${room}-${index}`}>
                      <span>{room}</span>
                      <div className="room-actions">
                        <button type="button" onClick={() => renameRoom(index)}>수정</button>
                        <button type="button" className="danger" onClick={() => removeRoom(index)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
                <footer>
                  <input value={newRoom} onChange={(event) => setNewRoom(event.target.value)} placeholder="객실명" />
                  <button className="master-add" type="button" onClick={addRoom}>+</button>
                </footer>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MasterColumn({
  title,
  items,
  active,
  onSelect,
  inputValue,
  inputPlaceholder,
  onInput,
  onAdd,
  onRename,
  onDelete,
  getKey = (item) => item,
  getLabel = (item) => item,
}) {
  return (
    <div className="master-card master-column">
      <header>{title}</header>
      <div className="master-list">
        {items.map((item) => (
          <div
            key={getKey(item)}
            className={`master-row ${active === getKey(item) ? 'active' : ''}`}
          >
            <button type="button" className="master-row-main" onClick={() => onSelect(item)}>
              {getLabel(item)}
            </button>
            <div className="master-row-actions">
              {onRename && <button type="button" onClick={() => onRename(item)}>수정</button>}
              {onDelete && <button type="button" className="danger" onClick={() => onDelete(item)}>삭제</button>}
            </div>
          </div>
        ))}
      </div>
      <footer>
        <input value={inputValue} onChange={(event) => onInput(event.target.value)} placeholder={inputPlaceholder} />
        <button className="master-add" type="button" onClick={onAdd}>+</button>
      </footer>
    </div>
  );
}

function Metric({ label, value, wide = false, compact = false }) {
  return (
    <div className={`metric ${wide ? 'metric-wide' : ''} ${compact ? 'metric-compact' : ''}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function TextInput({ label, value, onChange, className = '' }) {
  return (
    <Field label={label} className={className}>
      <input value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function NumberInput({ label, value, onChange, className = '' }) {
  return (
    <Field label={label} className={className}>
      <input type="number" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </Field>
  );
}

function DocumentPreview({ tab, reservation, foreignTotal, krwTotal }) {
  if (tab === 'confirmation') return <Confirmation reservation={reservation} />;
  return <Invoice reservation={reservation} foreignTotal={foreignTotal} krwTotal={krwTotal} />;
}

function Invoice({ reservation, foreignTotal, krwTotal }) {
  const roomSummary = summarizeRoomLines(reservation);
  const invoiceNotices = normalizeNoticeItems(reservation.noticeItems, reservation.invoiceRemark)
    .filter((item) => item.invoice && String(item.content || '').trim());
  return (
    <article className="document">
      <div className="document-content invoice-content">
      <div className="invoice-head">
        <div>
          <div className="doc-kicker">Payment Request</div>
          <h2 className="doc-title">INVOICE</h2>
        </div>
        <div className="invoice-company">
          {reservation.companyCiUrl && <img src={reservation.companyCiUrl} alt="" />}
          <div>
            <strong>{reservation.companyName || reservation.senderName || '업체 정보'}</strong>
            {reservation.companyAddress && <span>{reservation.companyAddress}</span>}
            {reservation.companyPhone && <span>{reservation.companyPhone}</span>}
            {reservation.companyEmail && <span>{reservation.companyEmail}</span>}
          </div>
        </div>
      </div>
      <div className="doc-rule" />
      <div className="doc-grid">
        <DocBox label="수신" value={reservation.partnerName} />
        <DocBox label="발신 / 작성일" value={`${reservation.senderName}\n${reservation.issueDate}`} />
        <DocBox label="예약명" value={reservation.leadGuest} />
        <DocBox label="호텔" value={reservation.hotelName} />
        <DocBox label="투숙일" value={`${stayDateTime(reservation.checkIn, reservation.checkInTime)} - ${stayDateTime(reservation.checkOut, reservation.checkOutTime)} / ${reservation.statedNights}박`} />
        <DocBox label="객실" value={roomSummary} />
      </div>
      <table className="invoice-charge-table">
        <thead>
          <tr>
            <th>항목</th>
            <th className="num">단가</th>
            <th className="num">수량</th>
            <th className="num">박수</th>
            <th className="num">합계</th>
          </tr>
        </thead>
        <tbody>
          {reservation.charges.map((line) => (
            <tr key={line.id}>
              <td>{line.label}</td>
              <td className="num">{money(line.unitPrice, reservation.currency)}</td>
              <td className="num">{line.quantity}</td>
              <td className="num">{line.nights}</td>
              <td className="num"><strong>{money(lineTotal(line), reservation.currency)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-summary">
        <div><strong>총입금액({reservation.currency})</strong><span>{money(foreignTotal, reservation.currency)}</span></div>
        <div><strong>적용환율</strong><span>{Number(reservation.exchangeRate || 0).toLocaleString('ko-KR')} / {reservation.exchangeRateDate}</span></div>
        <div className="doc-total"><strong>총입금액(원화)</strong><span>{krw(krwTotal)}</span></div>
      </div>
      {invoiceNotices.map((item) => (
        <div className="notice-box invoice-remark-box" key={item.id}>{item.content}</div>
      ))}
      <div className="notice-box invoice-payment-box">
        <div>
          <strong>입금 계좌</strong><br />{reservation.bankAccount}
        </div>
        {reservation.companySealUrl && (
          <img className="invoice-seal" src={reservation.companySealUrl} alt="" />
        )}
      </div>
      </div>
    </article>
  );
}

function Confirmation({ reservation }) {
  const confirmationNotices = normalizeNoticeItems(reservation.noticeItems, reservation.invoiceRemark)
    .filter((item) => item.confirmation && String(item.content || '').trim());
  const roomLines = getRoomLines(reservation).filter((line) => line.roomType || roomLineBedText(line));
  const pax = [
    reservation.adultCount ? `ADT ${reservation.adultCount}` : '',
    reservation.childCount ? `CHD ${reservation.childCount}` : '',
    reservation.infantCount ? `INF ${reservation.infantCount}` : '',
  ].filter(Boolean).join(' / ');
  const totalGuests = Number(reservation.adultCount || 0) + Number(reservation.childCount || 0) + Number(reservation.infantCount || 0);
  const hotelInitial = String(reservation.hotelName || 'H').trim().slice(0, 1).toUpperCase();
  const voucherPartnerCiUrl = reservation.partnerCiUrl || reservation.companyCiUrl;

  return (
    <article className="document voucher-document">
      <div className="document-content voucher-content">
        <header className="voucher-top">
          <div className="voucher-hotel-mark">
            {reservation.hotelLogoUrl ? (
              <img src={reservation.hotelLogoUrl} alt="" />
            ) : (
              <span>{hotelInitial}</span>
            )}
          </div>
          <div className="voucher-title-block">
            <p>Reservation Document</p>
            <h2>Hotel Voucher</h2>
            <em>호텔바우처</em>
          </div>
          <div className="voucher-company-mark">
            {voucherPartnerCiUrl ? <img src={voucherPartnerCiUrl} alt="" /> : <strong>{reservation.partnerName || reservation.companyName || '내일투어'}</strong>}
          </div>
        </header>

        <section className="voucher-section voucher-hotel-section">
          <div>
            <p className="voucher-section-kicker">Hotel Information</p>
            <h3>{reservation.hotelName || '-'}</h3>
            <dl className="voucher-info-list">
              <div>
                <dt>Address</dt>
                <dd>{reservation.hotelAddress || '-'}</dd>
              </div>
              <div>
                <dt>Telephone</dt>
                <dd>{reservation.hotelPhone || '-'}</dd>
              </div>
            </dl>
          </div>
          <aside className="voucher-confirm-card">
            <span>Confirmation No.</span>
            <strong>{reservation.confirmNo || '-'}</strong>
            <p>Present this confirmation at check-in.</p>
          </aside>
        </section>

        <section className="voucher-section">
          <p className="voucher-section-kicker">Booking Details</p>
          <div className="voucher-detail-grid">
            <DocBox label="Check-in" value={formatVoucherDate(reservation.checkIn)} />
            <DocBox label="Check-out" value={formatVoucherDate(reservation.checkOut)} />
            <DocBox label="Duration" value={`${reservation.statedNights || 0} Night${Number(reservation.statedNights || 0) === 1 ? '' : 's'}`} />
          </div>
          <div className="voucher-room-list">
            {(roomLines.length ? roomLines : [emptyRoomLine('', 1)]).map((line, index) => {
              const bedText = roomLineBedText(line);
              return (
                <div className="voucher-room-card" key={line.id || `room-${index}`}>
                  <p>Room {index + 1}</p>
                  <div>
                    <span>Room Type</span>
                    <strong>{line.roomType || '-'}</strong>
                  </div>
                  <div>
                    <span>Configuration</span>
                    <strong>{bedText || '-'} <small>({line.roomCount || 0} Room)</small></strong>
                  </div>
                  <div>
                    <span>Meal Plan</span>
                    <strong className="meal">{reservation.mealPlan || '-'}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="voucher-section">
          <p className="voucher-section-kicker">Guest Information</p>
          <div className="voucher-guest-row">
            <span>1</span>
            <strong>{reservation.leadGuest || '-'}</strong>
          </div>
          <div className="voucher-pax-pill">Total: {pax || `${totalGuests || 0} Guest`}</div>
        </section>

        {(confirmationNotices.length > 0 || reservation.customerNotice) && (
          <section className="voucher-section voucher-notice-section">
            <p className="voucher-section-kicker">Remark</p>
            {confirmationNotices.map((item) => (
              <p key={item.id}>{item.content}</p>
            ))}
            {reservation.customerNotice && <p>{reservation.customerNotice}</p>}
          </section>
        )}
      </div>
    </article>
  );
}


function DocBox({ label, value }) {
  return (
    <div className="doc-box">
      <p className="doc-label">{label}</p>
      <p className="doc-value">{String(value || '-').split('\n').map((line) => <span key={line}>{line}<br /></span>)}</p>
    </div>
  );
}

export default App;
