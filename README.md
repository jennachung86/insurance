# 보험/검사 일정 공동관리 앱

보험 납입일, 검사 유효기간 등을 여러 명이 공동 관리하고, 사진 한 장으로 항목을
자동 등록하며, 만료 임박 시 Push/SMS/카카오 알림톡으로 알려주는 모바일 앱.

## 아키텍처

```
insurance-schedule-app/
├── supabase/
│   └── schema.sql         ← DB 스키마 + RLS + 알람 자동 재설정 트리거
├── backend/                (Node.js + TypeScript, Express)
│   └── src/
│       ├── server.ts
│       ├── routes/
│       │   ├── ocr.ts        ← 사진 업로드 → Claude Vision OCR → 자동 필드 추출
│       │   ├── documents.ts  ← 문서 업로드(PDF/엑셀/HWP/워드/TXT) → 텍스트 추출 (구 file-extract-app 흡수)
│       │   └── items.ts      ← OCR 결과를 항목에 반영
│       ├── services/
│       │   ├── claudeOcr.ts        ← Anthropic SDK + 구조화된 출력(betaZodOutputFormat)
│       │   ├── documentExtract.ts  ← pdf-parse/xlsx/mammoth/HWP 바이트스트림 파싱
│       │   ├── alarmScheduler.ts   ← node-cron, 매분 만료 예정 알람 발송
│       │   └── notifiers/
│       │       ├── fcm.ts         ← App Push (Firebase Cloud Messaging)
│       │       ├── sms.ts         ← 문자 (Solapi 예시)
│       │       └── kakao.ts       ← 카카오 알림톡 (Solapi 예시)
│       └── supabaseClient.ts
└── mobile/                 (React Native / Expo)
    ├── App.tsx              ← 로그인 + 조직 판별
    └── src/
        ├── screens/MainScreen.tsx   ← Upcoming / 테이블 / 완료 3단 구성
        └── components/
            ├── UpcomingEventsList.tsx
            ├── DataTable.tsx
            ├── CompletedList.tsx
            ├── CellEditModal.tsx        ← 셀(항목) 편집 + 커스텀 필드
            ├── PhotoAttachButton.tsx    ← 카메라/갤러리 → OCR 자동입력
            └── DocumentAttachments.tsx  ← 파일 첨부/미리보기/다운로드/삭제 (구 file-extract-app 흡수)
```

> **참고**: 이전에 별도 프로젝트였던 `file-extract-app`(파일 업로드/다운로드/텍스트 추출 웹앱)의 기능은
> 위 `documents.ts` / `documentExtract.ts` / `DocumentAttachments.tsx`로 이 앱에 완전히 흡수되었습니다.
> 이제 별도로 실행할 필요 없이, 이 앱의 항목 편집 화면 안에서 파일 첨부 기능으로 동작합니다.

**왜 이렇게 나눴나:**
- **항목/커스텀필드 CRUD, 알람 규칙/수신자 CRUD**는 모바일 앱이 `@supabase/supabase-js`로 Supabase에 직접 접근합니다. Supabase Auth JWT + Row Level Security(RLS)가 "이 사용자가 이 조직 멤버인지, 역할이 무엇인지"를 DB 레벨에서 강제하므로 별도 백엔드 CRUD API가 필요 없습니다.
- **Node.js 백엔드**는 (1) Claude API 키처럼 클라이언트에 노출하면 안 되는 비밀키가 필요한 **OCR 파싱**, (2) 항상 떠 있어야 하는 **알람 스케줄러 + SMS/카카오 발신 대행사 자격증명**, 이 두 가지만 담당합니다.

## 1. Supabase 설정

1. Supabase 프로젝트 생성 후 SQL Editor에서 [schema.sql](supabase/schema.sql) 전체 실행
2. Authentication → 이메일/비밀번호 로그인 활성화
3. 최초 마스터 계정 가입 후, 아래 SQL로 조직을 하나 만들어준다 (앱에 조직 생성 UI를 추가하기 전까지 수동 실행):
   ```sql
   insert into public.profiles (id, full_name) values ('<auth.users.id>', '홍길동');
   insert into public.organizations (name, master_user_id) values ('우리회사', '<auth.users.id>')
     returning id; -- 이 id를 organization_members에도 넣어준다
   insert into public.organization_members (org_id, user_id, role) values ('<org id>', '<auth.users.id>', 'master');
   ```
4. Storage에 `item-photos` 버킷이 자동 생성됩니다 (schema.sql 마지막 부분).

## 2. 백엔드 (Claude OCR + 알람 스케줄러)

```bash
cd backend
npm install
cp .env.example .env   # ANTHROPIC_API_KEY, SUPABASE_*, FCM_*, SOLAPI_* 채우기
npm run dev
```

### 필요 npm 패키지 (참고)

```bash
npm install express cors dotenv multer node-cron zod @anthropic-ai/sdk @supabase/supabase-js firebase-admin pdf-parse xlsx mammoth
npm install -D typescript tsx @types/node @types/express @types/cors @types/multer @types/node-cron @types/pdf-parse
```

### 핵심 엔드포인트

| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/ocr/parse` | 사진(`photo`) + `org_id`/`item_id` → Claude Vision으로 필드 추출, Storage 저장, `ocr_extractions`에 기록 |
| POST | `/api/items/:id/apply-ocr` | 검토된 OCR 결과를 실제 `items` 레코드에 반영 |
| POST | `/api/documents/upload` | 문서(`file`, PDF/엑셀/HWP/워드/TXT) + `item_id` → 텍스트 추출, Storage 저장, `item_documents`에 기록 |
| GET | `/api/documents/:id/text` | 저장된 문서의 텍스트 재조회 |
| DELETE | `/api/documents/:id` | 문서 삭제 (Storage 원본 + 레코드) |

알람 스케줄러는 서버 기동과 동시에 매 1분 `alarm_rules`를 확인해 만료 임박 항목을 Push/SMS/카카오로 발송하고, `alarm_logs`에 기록합니다.

## 3. 모바일 앱 (React Native / Expo)

```bash
cd mobile
npm install
# app.json의 extra.supabaseUrl / supabaseAnonKey / apiBaseUrl 을 실제 값으로 수정
npx expo start
```

### 필요 npm 패키지 (참고)

```bash
npm install expo expo-constants expo-image-picker expo-document-picker expo-clipboard react-native-url-polyfill @supabase/supabase-js @react-native-async-storage/async-storage @react-native-community/datetimepicker
```

### 화면 구성 (요구사항 5번)

- **상단** `UpcomingEventsList` — 14일 이내 만료 예정 항목을 가로 스크롤 카드로, D-day 임박 순 정렬 (3일 이내는 빨간색 강조)
- **중앙** `DataTable` — 진행중 항목 테이블. 행을 누르면 `CellEditModal`이 열려 모든 컬럼(고정 + 커스텀) 편집 가능. 체크박스를 누르면 즉시 완료 처리되어 하단으로 이동
- **하단** `CompletedList` — 완료된 항목. 체크 아이콘을 다시 누르면 진행중으로 복귀

### 파일 첨부 및 텍스트 추출 (구 file-extract-app 기능)

`CellEditModal` 안의 `DocumentAttachments` 컴포넌트가 담당합니다 (항목을 먼저 저장한 뒤에만 표시됩니다 - 문서는 `item_id`에 종속되기 때문):

- 📎 **파일 첨부** 버튼 → `expo-document-picker`로 PDF/엑셀(.xlsx/.xls)/HWP/워드(.docx)/TXT 선택
- 업로드 즉시 백엔드가 `pdf-parse`/`xlsx`/`mammoth`/HWP 바이트스트림 파서로 텍스트 추출 → `item_documents.extracted_text`에 저장
- 목록에서 파일을 탭하면 추출된 텍스트 미리보기 + **복사하기** 버튼
- **다운로드** — Supabase Storage 서명 URL(60초 유효)을 생성해 브라우저/OS 뷰어로 열기
- **삭제** — Storage 원본 + DB 레코드 함께 제거

사진(OCR) 첨부와의 차이: 사진 첨부는 Claude Vision으로 셀 값을 **자동으로 채워주는** 용도이고, 파일 첨부는 원본 문서 전체 텍스트를 그대로 **보관·열람**하는 용도입니다.

## 4. 자동 알람 재설정 로직 (요구사항 3번)

`schema.sql`의 `handle_item_due_date_change()` 트리거가 담당합니다:

1. 완료된 항목의 `due_date`가 새 날짜로 갱신되면 → `status`를 자동으로 `in_progress`로 되돌림
2. 해당 항목의 `alarm_rules.next_trigger_at`을 `새 만료일 - remind_before` 로 재계산하고 `is_active = true`로 재활성화
3. `alarm_logs`에 "만료일 갱신으로 알람 재설정됨" 감사 로그 기록

알람 발송 자체(`backend/src/services/alarmScheduler.ts`)는 매분 `next_trigger_at <= now()` 인 활성 알람을 찾아 `alarm_rules.channels`에 등록된 채널(App Push / SMS / 카카오 알림톡)로 발송하고, 발송 후 `is_active = false`로 바꿔 중복 발송을 막습니다. 이후 위 트리거가 다시 활성화하기 전까지는 조용히 있습니다.

## 5. 멀티 계정 / RBAC (요구사항 4번)

- `organizations.master_user_id` — 조직을 만든 마스터 계정
- `organization_members.role` — `master` / `manager` / `member` 3단계
  - `master`, `manager`: 항목 생성/삭제, 커스텀 필드 정의, 멤버 초대·역할 변경(마스터만), 알람 수신자 관리
  - `member`: 전체 항목 조회 + 본인이 담당자로 지정된 항목만 수정
- `alarm_recipients` — 전화번호/푸시 토큰을 조직 전체 공통(`item_id = null`) 또는 특정 항목 전용으로 다중 등록 가능 → 알람 발송 시 자동으로 모두에게 전송

## 참고 / 한계

- SMS/카카오 알림톡은 Solapi를 예시로 구현했습니다. 실제 사용 전 [Solapi 개발자 문서](https://developers.solapi.com)로 서명 규격을 재확인하거나, Aligo/NHN Cloud 등 다른 대행사로 교체하려면 `backend/src/services/notifiers/` 안의 파일만 바꾸면 됩니다.
- 사진(OCR) 첨부는 이미지(JPEG/PNG/WEBP/GIF)만 지원합니다 - **HEIC/HEIF는 Claude Vision이 받아들이지 않습니다.** `expo-image-picker`의 기본 카메라 촬영은 JPEG로 나오므로 앱 자체는 문제 없지만, 갤러리에서 HEIC 원본 사진을 고르면 백엔드가 415 에러를 반환합니다.
- HWP 텍스트 추출(사진 OCR과 파일 첨부 둘 다)은 전용 OLE 파서가 아니라 바이트스트림 휴리스틱이라 완벽한 추출을 보장하지 않습니다.
- `@anthropic-ai/sdk`의 구조화된 출력 API는 버전에 따라 표면이 다릅니다 - 이 코드는 실제 설치되는 `0.70.x` 기준 `client.beta.messages.create()` + `betaZodOutputFormat` 조합으로 검증했습니다. SDK를 업그레이드하면 `claudeOcr.ts`를 다시 확인하세요.
