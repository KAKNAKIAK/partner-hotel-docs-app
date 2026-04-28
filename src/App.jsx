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
import { hasSupabaseConfig } from './supabaseClient.js';

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
  return { ...initialReservation, issueDate: todayDate() };
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
  return labels.join(', ');
}

function summarizeRoomLines(reservation) {
  return getRoomLines(reservation)
    .map((line) => {
      const bedText = roomLineBedText(line);
      const typeText = [line.roomType, bedText].filter(Boolean).join(' / ');
      return `${typeText || '객실'} ${line.roomCount || 0}실`;
    })
    .join(', ');
}

function totalRoomCount(reservation) {
  return getRoomLines(reservation).reduce((sum, line) => sum + Number(line.roomCount || 0), 0) || Number(reservation.roomCount || 1) || 1;
}

function stayDateTime(dateValue, timeValue) {
  return [dateValue, timeValue].filter(Boolean).join(' ');
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
    body { margin: 0; font-family: "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif; background: #edf1f6; color: #172033; }
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
  const [checkInError, setCheckInError] = useState('');
  const [currentFileHandle, setCurrentFileHandle] = useState(null);
  const [currentFileId, setCurrentFileId] = useState('');
  const [currentFileName, setCurrentFileName] = useState('');
  const [recentFiles, setRecentFiles] = useState(() => readRecentFiles());
  const [recentOpen, setRecentOpen] = useState(false);
  const [issueDateEditing, setIssueDateEditing] = useState(false);
  const [issueDateError, setIssueDateError] = useState('');
  const [exchangeSaveState, setExchangeSaveState] = useState('');
  const nightsInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const exchangeRateInputId = useId();
  const issueDateInputId = useId();

  useEffect(() => {
    if (!masterOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [masterOpen]);

  useEffect(() => {
    function closeRecentMenu(event) {
      if (!event.target.closest?.('.recent-menu-wrap')) setRecentOpen(false);
    }

    document.addEventListener('click', closeRecentMenu);
    return () => document.removeEventListener('click', closeRecentMenu);
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

  const autoNights = calcNights(reservation.checkIn, reservation.checkOut);
  const roomOptions = useMemo(() => {
    const rooms = Array.isArray(reservation.hotelRooms) ? reservation.hotelRooms.filter(Boolean) : [];
    if (reservation.roomType && !rooms.includes(reservation.roomType)) return [reservation.roomType, ...rooms];
    return rooms;
  }, [reservation.hotelRooms, reservation.roomType]);
  const roomLines = useMemo(() => getRoomLines(reservation), [reservation.roomLines, reservation.roomType, reservation.roomCount]);
  const roomSummary = useMemo(() => summarizeRoomLines(reservation), [reservation.roomLines, reservation.roomType, reservation.roomCount]);
  const foreignTotal = useMemo(
    () => reservation.charges.reduce((sum, line) => sum + lineTotal(line), 0),
    [reservation.charges]
  );
  const krwTotal = applyRounding(foreignTotal * Number(reservation.exchangeRate || 0), reservation.rounding);

  const warnings = useMemo(() => {
    const items = [];
    if (autoNights !== Number(reservation.statedNights || 0)) {
      items.push(`체크인/체크아웃 기준 ${autoNights}박인데 입력 박수는 ${reservation.statedNights}박입니다.`);
    }
    if (!reservation.partnerId) items.push('거래처 마스터가 선택되지 않았습니다.');
    if (!reservation.companyId) items.push('업체 정보가 선택되지 않았습니다.');
    if (!reservation.hotelId) items.push('호텔 마스터가 선택되지 않았습니다.');
    if (!String(reservation.confirmNo || '').trim()) items.push('호텔 확정번호가 비어 있습니다.');
    if (!String(reservation.exchangeRateDate || '').trim()) items.push('환율 기준일이 비어 있습니다.');
    if (
      String(reservation.mealPlan || '').toLowerCase().includes('breakfast included') &&
      reservation.charges.some((line) => String(line.label).includes('조식'))
    ) {
      items.push('조식 포함 조건인데 조식 추가 비용 라인이 있습니다.');
    }
    if (
      String(reservation.checkOutTime || '').trim() === '18시' &&
      !reservation.charges.some((line) => String(line.label).includes('레이트'))
    ) {
      items.push('체크아웃 18시 선택 상태인데 레이트 체크아웃 요금 라인이 없습니다.');
    }
    return items;
  }, [autoNights, reservation]);

  function patch(changes) {
    setReservation((current) => ({ ...current, ...changes }));
  }

  function patchField(key, value) {
    setReservation((current) => {
      return { ...current, [key]: value };
    });
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
    setReservation((current) => ({
      ...current,
      statedNights: nights,
      checkOut: normalizeDateInput(current.checkIn) && nights > 0 ? addDays(current.checkIn, nights) : current.checkOut,
    }));
  }

  function selectPartner(partner) {
    patch({
      partnerId: partner.id,
      partnerName: partner.recipientName || partner.name,
      paymentTerms: partner.paymentTerms,
      invoiceRemark: partner.invoiceRemark,
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
    patch({
      hotelId: hotel.id,
      hotelName: hotel.name,
      hotelAddress: hotel.address,
      hotelPhone: hotel.phone,
      hotelRooms: hotel.rooms || [],
      roomType: hotel.rooms?.[0] || '',
      roomLines: [emptyRoomLine(hotel.rooms?.[0] || '', 1)],
      checkInTime: hotel.defaultCheckInTime || '',
      checkOutTime: hotel.defaultCheckOutTime || '',
      mealPlan: hotel.defaultMealPlan,
      customerNotice: hotel.defaultNotice,
    });
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
    saveReservation(reservation)
      .then((saved) => {
        setReservation((current) => ({ ...current, id: saved.id || current.id }));
        setSaveState('Supabase 저장 완료');
      })
      .catch((error) => {
        console.error(error);
        setSaveState('Supabase 저장 실패');
      });
  }

  function resetLocalDocument() {
    setReservation(createInitialReservation());
    setCurrentFileHandle(null);
    setCurrentFileId('');
    setCurrentFileName('');
    setSaveState('새 문서로 초기화했습니다.');
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
      return;
    }

    downloadLocalHtml(fileName, html);
    rememberRecentFile(fileName, null);
    setCurrentFileName(fileName);
    setSaveState(`${fileName} 다운로드 완료`);
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
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      alert(error.message || 'HTML 파일을 저장하지 못했습니다.');
    }
  }

  async function saveLocalFileAs() {
    try {
      await saveLocalAs();
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
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
    const nextReservation = await applyLatestDbExchangeRate({ ...createInitialReservation(), ...loaded });
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
        setReservation({ ...createInitialReservation(), ...saved });
      })
      .catch((error) => {
        console.error(error);
        alert('Supabase 예약 데이터를 불러오지 못했습니다.');
      });
  }

  const tabs = [
    ['invoice', '거래처 인보이스'],
    ['confirmation', '호텔 확정서'],
    ['audit', '검수표'],
  ];
  const workflowSteps = [
    ['source', '1', '기본정보'],
    ['booking', '2', '호텔·예약'],
    ['charges', '3', '요금'],
    ['settlement', '4', '정산'],
  ];

  return (
    <>
      <header className="app-topbar">
        <div className="header-title-cluster">
          <button className="btn btn-master" type="button" onClick={() => setMasterOpen(true)}>
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

      <main className="app-shell">
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>예약 원본 입력</h2>
            <span className="status-chip">{reservation.status}</span>
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
              <div className="grid grid-3">
                <TextInput label="통화" value={reservation.currency} onChange={(value) => patchField('currency', value)} />
                <NumberInput label="환율" value={reservation.exchangeRate} onChange={(value) => patchField('exchangeRate', value)} />
                <TextInput
                  label="환율 기준일"
                  value={reservation.exchangeRateDate}
                  onChange={(value) => patchField('exchangeRateDate', value)}
                />
                <Field label="원화 처리" className="span-3">
                  <select value={reservation.rounding} onChange={(event) => patchField('rounding', event.target.value)}>
                    <option value="round">반올림</option>
                    <option value="floor">절사</option>
                    <option value="ceil">올림</option>
                  </select>
                </Field>
                <TextInput label="식사 조건" className="span-3" value={reservation.mealPlan} onChange={(value) => patchField('mealPlan', value)} />
                <TextInput
                  label="결제 조건"
                  className="span-3"
                  value={reservation.paymentTerms}
                  onChange={(value) => patchField('paymentTerms', value)}
                />
                <Field label="고객 안내사항" className="span-3">
                  <textarea value={reservation.customerNotice} onChange={(event) => patchField('customerNotice', event.target.value)} />
                </Field>
                <details className="default-box span-3">
                  <summary>거래처 인보이스 문구</summary>
                  <Field label="거래처 인보이스 문구">
                    <textarea value={reservation.invoiceRemark} onChange={(event) => patchField('invoiceRemark', event.target.value)} />
                  </Field>
                </details>
              </div>
            </Step>
            )}
          </div>
          <div className="form-foot">
            <button
              className="btn btn-small"
              type="button"
              onClick={() => {
                const index = workflowSteps.findIndex(([id]) => id === activeStep);
                setActiveStep(workflowSteps[Math.max(0, index - 1)][0]);
              }}
            >
              이전
            </button>
            <span>{workflowSteps.find(([id]) => id === activeStep)?.[2]}</span>
            <button
              className="btn btn-small btn-primary"
              type="button"
              onClick={() => {
                const index = workflowSteps.findIndex(([id]) => id === activeStep);
                setActiveStep(workflowSteps[Math.min(workflowSteps.length - 1, index + 1)][0]);
              }}
            >
              다음
            </button>
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
            <div className="preview-hint">백엔드 연동 준비형 입력 플로우</div>
          </div>
          <div className="preview-canvas">
            <DocumentPreview
              tab={activeTab}
              reservation={reservation}
              foreignTotal={foreignTotal}
              krwTotal={krwTotal}
              warnings={warnings}
            />
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel audit-panel">
            <div className="panel-header">
              <h2>실시간 검수</h2>
              <span className="status-chip">{warnings.length}건</span>
            </div>
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
              <div className="checklist">
                {warnings.length ? (
                  warnings.map((warning) => <div className="warning" key={warning}>{warning}</div>)
                ) : (
                  <div className="ok">출력 전 필수 검수 항목이 정상입니다.</div>
                )}
              </div>
              <button className="btn btn-primary audit-pdf-btn" type="button" onClick={() => window.print()}>
                PDF 파일
              </button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
            <h2>백엔드 연결 포인트</h2>
            </div>
            <div className="side-body">
              <p className="quick-note">
                현재 데이터 소스: {hasSupabaseConfig ? 'Supabase' : 'Supabase 환경변수 미설정'}<br />
                현재 파일: {currentFileName || '새 문서'}<br />
                환율 상태: {exchangeSaveState || '저장 환율 대기'}<br />
                {saveState || '검색, 저장, 마스터 관리는 Supabase DB와 직접 연결됩니다.'}
              </p>
            </div>
          </section>
        </aside>
      </main>
      {masterOpen && <MasterDataManager onClose={() => setMasterOpen(false)} />}
    </>
  );
}

function MasterDataManager({ onClose }) {
  const ciInputId = useId();
  const hotelViInputId = useId();
  const companyCiInputId = useId();
  const companySealInputId = useId();
  const [activeTab, setActiveTab] = useState('hotels');
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

function DocumentPreview({ tab, reservation, foreignTotal, krwTotal, warnings }) {
  if (tab === 'confirmation') return <Confirmation reservation={reservation} />;
  if (tab === 'audit') return <Audit reservation={reservation} foreignTotal={foreignTotal} krwTotal={krwTotal} warnings={warnings} />;
  return <Invoice reservation={reservation} foreignTotal={foreignTotal} krwTotal={krwTotal} />;
}

function Invoice({ reservation, foreignTotal, krwTotal }) {
  const roomSummary = summarizeRoomLines(reservation);
  return (
    <article className="document">
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
      <table>
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
      <div className="notice-box invoice-payment-box">
        <div>
          <strong>입금 계좌</strong><br />{reservation.bankAccount}<br /><br />{reservation.invoiceRemark}
        </div>
        {reservation.companySealUrl && (
          <img className="invoice-seal" src={reservation.companySealUrl} alt="" />
        )}
      </div>
    </article>
  );
}

function Confirmation({ reservation }) {
  const roomSummary = summarizeRoomLines(reservation);
  const pax = [
    reservation.adultCount ? `ADT ${reservation.adultCount}` : '',
    reservation.childCount ? `CHD ${reservation.childCount}` : '',
    reservation.infantCount ? `INF ${reservation.infantCount}` : '',
  ].filter(Boolean).join(' / ');

  return (
    <article className="document">
      <div className="doc-kicker">Reservation Document</div>
      <h2 className="doc-title">HOTEL CONFIRMATION</h2>
      <div className="confirm-hero">
        <p className="doc-label">Confirmation No.</p>
        <p className="confirm-no">{reservation.confirmNo || '-'}</p>
      </div>
      <div className="doc-rule" />
      <h3 className="doc-hotel-name">{reservation.hotelName}</h3>
      <p className="doc-meta">{reservation.hotelAddress}<br />{reservation.hotelPhone}</p>
      <div className="doc-grid">
        <DocBox label="예약자" value={reservation.leadGuest} />
        <DocBox label="투숙 인원" value={pax || '-'} />
        <DocBox label="체크인" value={stayDateTime(reservation.checkIn, reservation.checkInTime)} />
        <DocBox label="체크아웃" value={stayDateTime(reservation.checkOut, reservation.checkOutTime)} />
        <DocBox label="숙박" value={`${reservation.statedNights}박`} />
        <DocBox label="객실" value={roomSummary} />
        <DocBox label="식사 조건" value={reservation.mealPlan} />
        <DocBox label="결제 조건" value={reservation.paymentTerms} />
      </div>
      <div className="notice-box"><strong>안내사항</strong><br />{reservation.customerNotice}</div>
    </article>
  );
}

function Audit({ reservation, foreignTotal, krwTotal, warnings }) {
  return (
    <article className="document">
      <div className="doc-kicker">Internal Review</div>
      <h2 className="doc-title">검수표</h2>
      <div className="doc-rule" />
      <ul className="audit-list">
        <li><strong>거래처 마스터</strong><span>{reservation.partnerId || '-'}</span></li>
        <li><strong>호텔 마스터</strong><span>{reservation.hotelId || '-'}</span></li>
        <li><strong>박수</strong><span>{reservation.statedNights}박</span></li>
        <li><strong>투숙 인원</strong><span>성인 {reservation.adultCount} / 아동 {reservation.childCount} / 유아 {reservation.infantCount}</span></li>
        <li><strong>외화 합계</strong><span>{money(foreignTotal, reservation.currency)}</span></li>
        <li><strong>원화 청구액</strong><span>{krw(krwTotal)}</span></li>
      </ul>
      <div className="checklist">
        {warnings.length ? warnings.map((warning) => <div className="warning" key={warning}>{warning}</div>) : <div className="ok">출력 전 필수 검수 항목이 정상입니다.</div>}
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
