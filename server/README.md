# AON 오늘의 센터 — 로그인·서버 저장 버전

에이온 운동센터의 할 일·담당자·마감·진행 상태와 센터 일정을 관리하는 업무 대문입니다.

## 현재 기능

- ChatGPT 로그인 + Sites 소유자 전용 접근 설정
- D1 서버 저장: 업무와 일정의 조회·등록·수정
- 업무 검색, 담당자·상태·내가 등록한 업무 필터
- 업무 마감과 센터 일정 구분, 한국 시간 기준 표시
- 동시 수정 충돌 감지와 중복 생성 방지
- 조회한 업무·일정 JSON 백업 다운로드
- 발행 전 블로그 예시: 원고·근거·검수·이미지·Word

브라우저에 업무 데이터를 저장하지 않습니다. 처음 배포되는 서버 DB는 비어 있습니다. 로컬 테스트 데이터는 운영 서버에 복사하지 않습니다. 회원의 개인정보·건강정보를 기록하는 용도로 만들지 않았습니다.

## 운영 범위

저장소의 비공개 설정과 사이트 방문 권한은 별개입니다. 사이트는 현재 소유자 1명만 허용합니다. 직원 초대와 권한 확대는 별도 설정이 필요합니다. ChatGPT 로그인이 신원을 확인하고, Sites 접근 정책이 방문 허용 여부를 결정합니다. 앱 API도 로그인 여부를 확인합니다.

블로그는 완성 형태를 보여주는 예시입니다. AI 자동 집필, C.C 검수, 네이버 자동 발행, 기존 회원 DB 연동은 구현하지 않았습니다. 삭제·초기화 API도 없습니다.

## 로컬 실행

Node.js 22.13 이상. 공식 Sites 설치 도구 또는 `npm ci`로 의존성을 설치한 뒤 다음 순서로 실행합니다.

1. `npm run build`
2. 처음 빈 로컬 DB에서만: `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_abandoned_cardiac.sql`
3. `npm run dev -- --port 18743 --hostname 127.0.0.1`
4. `http://127.0.0.1:18743/signin-with-chatgpt?return_to=/`에서 개발용 계정으로 접속합니다.

개발 계정은 루프백 개발 서버에서만 작동하며 배포물에는 포함되지 않습니다. 로컬과 운영 DB는 별개입니다. 적용된 마이그레이션을 반복 적용하지 마세요.

## 검증

- `node --test tests/aon-backend.test.mjs`: 실제 생성 SQL을 SQLite에 적용해 인증·입력·중복·동시 수정 등을 검사합니다.
- `node tests/aon-http-smoke.mjs`: 실행 중인 127.0.0.1 개발 서버와 실제 로컬 D1을 검사하며, `[API 검증]` 업무를 생성합니다. 외부 서버에 실행할 수 없도록 제한했습니다.
- `node --check public/dashboard.js`

화면 검증은 실제 브라우저에서 진행합니다. 운영 로그인과 여러 실제 기기에서의 사용 여부는 별도 확인 기록을 기준으로 판단합니다.

## 배포

`.openai/hosting.json`의 기존 project_id를 유지합니다. Sites 공식 source helper로 소스를 동기화·빌드·패키징한 뒤 소유자 전용 배포 도구를 사용합니다. SQL 마이그레이션은 배포 과정에서 적용됩니다. 토큰, `.env*`, `.wrangler`, `.sites-runtime`, 테스트 DB, `node_modules`, `dist`를 GitHub에 올리지 않습니다.

소스 보관: https://github.com/kjp9204-oss/aon-work-dashboard (공개 소스 저장소, 실행 사이트는 소유자 로그인 필요)
