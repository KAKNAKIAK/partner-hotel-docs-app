# 거래처 인보이스·호텔 확정서 작성기

React + Vite 기반 예약 문서 작성 도구입니다.

## 실행

```bash
npm install
npm run dev
```

Google Drive 폴더에서는 `node_modules` 쓰기 오류가 날 수 있어 `npm run dev`는 의존성을 `%LOCALAPPDATA%\partner-hotel-docs-deps`에 설치한 뒤 Vite를 실행합니다.

## 현재 구조

- `src/data.js`: 백엔드 API로 교체하기 전 mock 마스터 데이터
- `src/App.jsx`: 예약 입력, 거래처/호텔 검색, 요금 라인, 검수, 문서 미리보기
- `src/styles.css`: 업무용 3패널 레이아웃과 인쇄 스타일
- `legacy-index.html`: 이전 단일 HTML 버전 백업

## 백엔드 연결 예정 포인트

- 거래처 검색: `partners` 테이블
- 호텔 검색: `hotels` 테이블
- 예약 저장: `reservations` 테이블
- Supabase 환경변수가 없으면 mock 데이터와 `localStorage`로 동작

## Supabase 설정

1. Supabase 프로젝트를 만든다.
2. `supabase/schema.sql`을 SQL Editor에서 실행한다.
3. `.env.example`을 참고해 로컬 `.env`를 만든다.
4. GitHub 저장소 Settings → Secrets and variables → Actions에 아래 값을 추가한다.

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## GitHub Pages 배포

`.github/workflows/deploy.yml`이 `main` 브랜치 push 시 `dist`를 GitHub Pages로 배포합니다.
