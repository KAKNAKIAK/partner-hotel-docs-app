import { cloneElement, isValidElement, useEffect, useId, useMemo, useState } from 'react';
import { initialReservation } from './data.js';
import {
  createHotel,
  createCountry,
  createPartner,
  createRegion,
  deleteCountry,
  deleteHotel,
  deletePartner,
  deleteRegion,
  listCountries,
  listHotels,
  listPartners,
  listRegions,
  loadCompanyInfo,
  loadLatestReservation,
  saveCompanyInfo,
  saveReservation,
  searchHotels,
  searchPartners,
  updateCountry,
  updateHotel,
  updatePartner,
  updateRegion,
} from './api.js';
import { hasSupabaseConfig } from './supabaseClient.js';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function calcNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
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
    ciUrl: '',
    address: '',
    phone: '',
    email: '',
    bankAccount: '',
    sealUrl: '',
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
  const [reservation, setReservation] = useState(initialReservation);
  const [activeTab, setActiveTab] = useState('invoice');
  const [activeStep, setActiveStep] = useState('source');
  const [manualNights, setManualNights] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);

  useEffect(() => {
    if (!masterOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [masterOpen]);

  const autoNights = calcNights(reservation.checkIn, reservation.checkOut);
  const foreignTotal = useMemo(
    () => reservation.charges.reduce((sum, line) => sum + lineTotal(line), 0),
    [reservation.charges]
  );
  const krwTotal = applyRounding(foreignTotal * Number(reservation.exchangeRate || 0), reservation.rounding);

  const warnings = useMemo(() => {
    const items = [];
    if (autoNights !== Number(reservation.statedNights || 0)) {
      items.push(`체크인/체크아웃 기준 ${autoNights}박인데 문서 표시 박수는 ${reservation.statedNights}박입니다.`);
    }
    if (!reservation.partnerId) items.push('거래처 마스터가 선택되지 않았습니다.');
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
      String(reservation.lateCheckout || '').trim() &&
      !reservation.charges.some((line) => String(line.label).includes('레이트'))
    ) {
      items.push('레이트 체크아웃 시간이 있지만 레이트 체크아웃 요금 라인이 없습니다.');
    }
    return items;
  }, [autoNights, reservation]);

  function patch(changes) {
    setReservation((current) => ({ ...current, ...changes }));
  }

  function patchField(key, value) {
    setReservation((current) => {
      const next = { ...current, [key]: value };
      if ((key === 'checkIn' || key === 'checkOut') && !manualNights) {
        const nextNights = calcNights(next.checkIn, next.checkOut);
        if (nextNights) next.statedNights = nextNights;
      }
      return next;
    });
  }

  function selectPartner(partner) {
    patch({
      partnerId: partner.id,
      partnerName: partner.recipientName || partner.name,
      senderName: partner.senderName,
      paymentTerms: partner.paymentTerms,
      bankAccount: partner.bankAccount,
      invoiceRemark: partner.invoiceRemark,
    });
  }

  function selectHotel(hotel) {
    patch({
      hotelId: hotel.id,
      hotelName: hotel.name,
      hotelAddress: hotel.address,
      hotelPhone: hotel.phone,
      mealPlan: hotel.defaultMealPlan,
      customerNotice: hotel.defaultNotice,
    });
  }

  function addCharge(type) {
    const roomCount = Number(reservation.roomCount || 1) || 1;
    const adultCount = Number(reservation.adultCount || 1) || 1;
    const nights = autoNights || Number(reservation.statedNights || 1) || 1;
    const templates = {
      room: { label: '객실 요금', unitPrice: 0, quantity: roomCount, nights },
      late: { label: '레이트 체크아웃', unitPrice: 0, quantity: roomCount, nights: 1 },
      breakfast: { label: '조식 추가 비용', unitPrice: 0, quantity: adultCount, nights: 1 },
      custom: { label: '추가 요금', unitPrice: 0, quantity: 1, nights: 1 },
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

  function loadDraft() {
    loadLatestReservation()
      .then((saved) => {
        if (!saved) {
          alert('Supabase에 저장된 예약이 없습니다.');
          return;
        }
        setReservation({ ...initialReservation, ...saved });
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
    ['source', '1', '거래처·호텔'],
    ['booking', '2', '예약'],
    ['stay', '3', '투숙'],
    ['charges', '4', '요금'],
    ['settlement', '5', '정산'],
  ];

  return (
    <>
      <header className="app-topbar">
        <div className="brand">
          <div className="brand-kicker">Partner Hotel Docs</div>
          <h1 className="brand-title">거래처 인보이스·호텔 확정서 작성</h1>
        </div>
        <div className="top-summary" aria-label="예약 요약">
          <Summary label="예약명" value={reservation.leadGuest || '-'} />
          <Summary label="투숙일" value={`${reservation.checkIn || '-'} → ${reservation.checkOut || '-'}`} />
          <Summary label="청구액" value={krw(krwTotal)} />
          <Summary label="검수" value={warnings.length ? `확인 ${warnings.length}건` : '정상'} />
        </div>
        <div className="toolbar">
          <button className="btn" type="button" onClick={() => setReservation(initialReservation)}>
            초기화
          </button>
          <button className="btn" type="button" onClick={saveDraft}>
            임시 저장
          </button>
          <button className="btn" type="button" onClick={loadDraft}>
            불러오기
          </button>
          <button className="btn" type="button" onClick={() => setMasterOpen(true)}>
            마스터 관리
          </button>
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>
            인쇄 / PDF
          </button>
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
            <Step number="1" title="거래처·호텔 선택">
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
                  label="호텔 검색"
                  value={reservation.hotelName}
                  loadOptions={searchHotels}
                  getLabel={(item) => item.name}
                  getMeta={(item) => `${item.city || ''} ${item.country || ''}`}
                  onSelect={selectHotel}
                  placeholder="호텔명을 입력하세요"
                />
              </div>
            </Step>
            )}

            {activeStep === 'booking' && (
            <Step number="2" title="예약 기본">
              <div className="grid grid-2">
                <TextInput label="예약명" value={reservation.leadGuest} onChange={(value) => patchField('leadGuest', value)} />
                <TextInput label="확정번호" value={reservation.confirmNo} onChange={(value) => patchField('confirmNo', value)} />
                <TextInput label="작성일" value={reservation.issueDate} onChange={(value) => patchField('issueDate', value)} />
                <Field label="상태">
                  <select value={reservation.status} onChange={(event) => patchField('status', event.target.value)}>
                    <option>작성중</option>
                    <option>검수필요</option>
                    <option>확정완료</option>
                    <option>송금요청</option>
                    <option>입금완료</option>
                  </select>
                </Field>
              </div>
            </Step>
            )}

            {activeStep === 'stay' && (
            <Step number="3" title="투숙 조건">
              <div className="grid grid-2">
                <TextInput label="체크인" value={reservation.checkIn} onChange={(value) => patchField('checkIn', value)} />
                <TextInput label="체크아웃" value={reservation.checkOut} onChange={(value) => patchField('checkOut', value)} />
                <Field label="자동 계산 박수">
                  <div className="calc-card">
                    <span>체크인·체크아웃 기준</span>
                    <strong>{autoNights}박</strong>
                  </div>
                </Field>
                <Field label="문서 표시 박수">
                  <input
                    type="number"
                    value={reservation.statedNights}
                    onChange={(event) => {
                      setManualNights(true);
                      patchField('statedNights', Number(event.target.value || 0));
                    }}
                  />
                  <button
                    className="btn btn-small"
                    type="button"
                    onClick={() => {
                      setManualNights(false);
                      patchField('statedNights', autoNights);
                    }}
                  >
                    자동 박수 반영
                  </button>
                </Field>
                <TextInput label="객실 타입" value={reservation.roomType} onChange={(value) => patchField('roomType', value)} />
                <NumberInput label="객실 수" value={reservation.roomCount} onChange={(value) => patchField('roomCount', value)} />
                <NumberInput label="성인" value={reservation.adultCount} onChange={(value) => patchField('adultCount', value)} />
                <NumberInput label="아동" value={reservation.childCount} onChange={(value) => patchField('childCount', value)} />
                <NumberInput label="유아" value={reservation.infantCount} onChange={(value) => patchField('infantCount', value)} />
                <TextInput label="레이트 체크아웃" value={reservation.lateCheckout} onChange={(value) => patchField('lateCheckout', value)} />
              </div>
            </Step>
            )}

            {activeStep === 'charges' && (
            <Step number="4" title="요금 구성">
              <div className="template-row">
                <button className="btn btn-small" type="button" onClick={() => addCharge('room')}>객실</button>
                <button className="btn btn-small" type="button" onClick={() => addCharge('late')}>레이트</button>
                <button className="btn btn-small" type="button" onClick={() => addCharge('breakfast')}>조식</button>
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
            <Step number="5" title="정산·안내">
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
                  <summary>발신·계좌·인보이스 문구</summary>
                  <div className="grid grid-2">
                    <TextInput label="발신" className="span-2" value={reservation.senderName} onChange={(value) => patchField('senderName', value)} />
                    <TextInput
                      label="입금 계좌"
                      className="span-2"
                      value={reservation.bankAccount}
                      onChange={(value) => patchField('bankAccount', value)}
                    />
                    <Field label="거래처 인보이스 문구" className="span-2">
                      <textarea value={reservation.invoiceRemark} onChange={(event) => patchField('invoiceRemark', event.target.value)} />
                    </Field>
                  </div>
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
          <section className="panel">
            <div className="panel-header">
              <h2>실시간 검수</h2>
              <span className="status-chip">{warnings.length}건</span>
            </div>
            <div className="side-body">
              <div className="metric-grid">
                <Metric label="자동 박수" value={`${autoNights}박`} />
                <Metric label="외화 합계" value={money(foreignTotal, reservation.currency)} />
                <Metric label="원화 청구액" value={krw(krwTotal)} wide />
              </div>
              <div className="checklist">
                {warnings.length ? (
                  warnings.map((warning) => <div className="warning" key={warning}>{warning}</div>)
                ) : (
                  <div className="ok">출력 전 필수 검수 항목이 정상입니다.</div>
                )}
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
            <h2>백엔드 연결 포인트</h2>
            </div>
            <div className="side-body">
              <p className="quick-note">
                현재 데이터 소스: {hasSupabaseConfig ? 'Supabase' : 'Supabase 환경변수 미설정'}<br />
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
  const [companyInfo, setCompanyInfo] = useState(emptyCompanyInfo());
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
  const rooms = selectedHotel?.rooms || [];

  useEffect(() => {
    let ignore = false;
    Promise.all([listPartners(), listHotels(), listCountries(), listRegions(), loadCompanyInfo()])
      .then(([partnerRows, hotelRows, countryRows, regionRows, companyRow]) => {
        if (ignore) return;
        setPartners(partnerRows);
        setHotels(hotelRows);
        setCountries(countryRows);
        setRegions(regionRows);
        setCompanyInfo(companyRow);
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
        setMasterState('호텔 수정 실패');
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

  function updateCompanyInfo(changes) {
    setCompanyInfo((current) => ({ ...current, ...changes }));
  }

  function saveCompanySettings() {
    setMasterState('업체 정보 저장 중');
    saveCompanyInfo(companyInfo)
      .then((saved) => {
        setCompanyInfo(saved);
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
      updateCompanyInfo({ [key]: String(reader.result || '') });
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
          <section className="master-company-panel">
            <div className="master-card company-info-card">
              <header>업체 정보</header>
              <div className="company-info-body">
                <div className="company-image-grid">
                  <Field label="CI">
                    <label
                      className={`logo-box company-image-dropzone ${isCompanyCiDragging ? 'dragging' : ''} ${companyInfo.ciUrl ? 'has-image' : ''}`}
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
                      {companyInfo.ciUrl ? <img src={companyInfo.ciUrl} alt="" /> : <span>CI</span>}
                    </label>
                  </Field>
                  <Field label="직인">
                    <label
                      className={`logo-box company-image-dropzone ${isCompanySealDragging ? 'dragging' : ''} ${companyInfo.sealUrl ? 'has-image' : ''}`}
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
                      {companyInfo.sealUrl ? <img src={companyInfo.sealUrl} alt="" /> : <span>직인</span>}
                    </label>
                  </Field>
                </div>
                <Field label="주소">
                  <textarea
                    value={companyInfo.address}
                    onChange={(event) => updateCompanyInfo({ address: event.target.value })}
                  />
                </Field>
                <div className="company-field-grid">
                  <Field label="전화번호">
                    <input
                      value={companyInfo.phone}
                      onChange={(event) => updateCompanyInfo({ phone: event.target.value })}
                    />
                  </Field>
                  <Field label="이메일주소">
                    <input
                      type="email"
                      value={companyInfo.email}
                      onChange={(event) => updateCompanyInfo({ email: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="계좌번호">
                  <input
                    value={companyInfo.bankAccount}
                    onChange={(event) => updateCompanyInfo({ bankAccount: event.target.value })}
                  />
                </Field>
                <div className="detail-actions company-actions">
                  <button className="btn btn-primary btn-small" type="button" onClick={saveCompanySettings}>저장</button>
                </div>
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

function Summary({ label, value }) {
  return (
    <div className="summary-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value, wide = false }) {
  return (
    <div className={`metric ${wide ? 'metric-wide' : ''}`}>
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
  return (
    <article className="document">
      <div className="doc-kicker">Payment Request</div>
      <h2 className="doc-title">INVOICE</h2>
      <div className="doc-rule" />
      <div className="doc-grid">
        <DocBox label="수신" value={reservation.partnerName} />
        <DocBox label="발신 / 작성일" value={`${reservation.senderName}\n${reservation.issueDate}`} />
        <DocBox label="예약명" value={reservation.leadGuest} />
        <DocBox label="호텔" value={reservation.hotelName} />
        <DocBox label="투숙일" value={`${reservation.checkIn} - ${reservation.checkOut} / ${reservation.statedNights}박`} />
        <DocBox label="객실" value={`${reservation.roomType} / ${reservation.roomCount}실`} />
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
      <div className="notice-box"><strong>입금 계좌</strong><br />{reservation.bankAccount}<br /><br />{reservation.invoiceRemark}</div>
    </article>
  );
}

function Confirmation({ reservation }) {
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
        <DocBox label="체크인" value={reservation.checkIn} />
        <DocBox label="체크아웃" value={reservation.checkOut} />
        <DocBox label="숙박" value={`${reservation.statedNights}박`} />
        <DocBox label="객실" value={`${reservation.roomType} / ${reservation.roomCount}실`} />
        <DocBox label="식사 조건" value={reservation.mealPlan} />
        <DocBox label="결제 조건" value={reservation.paymentTerms} />
      </div>
      {reservation.lateCheckout && <div className="notice-box"><strong>레이트 체크아웃</strong><br />{reservation.lateCheckout}까지로 기록되어 있습니다.</div>}
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
        <li><strong>문서 표시 박수</strong><span>{reservation.statedNights}박</span></li>
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
