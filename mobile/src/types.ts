export type ItemStatus = 'in_progress' | 'completed';
export type TimeUnit = 'hour' | 'day' | 'week';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomFieldDefinition {
  id: string;
  org_id: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  select_options: string[] | null;
  sort_order: number;
  is_active: boolean;
}

/** 품목(item) 하나에 딸린 일정 하나 (분류 + 만료일 + 알람주기). 한 품목에 여러 개 등록 가능. */
export interface ItemSchedule {
  id: string;
  item_id: string;
  category: string;
  due_date: string | null; // YYYY-MM-DD
  remind_before_value: number;
  remind_before_unit: TimeUnit;
  status: ItemStatus;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** 품목(예: "자동차") - 여러 개의 일정(보험/검사 등)을 가질 수 있다. */
export interface ScheduleItem {
  id: string;
  org_id: string;
  item_name: string;
  assignee_user_id: string | null;
  assignee_name?: string | null; // 조인해서 채움
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  schedules: ItemSchedule[];
}

/** 화면 표시용 평면 행: 품목 + 일정 하나를 합친 것 (테이블/카드는 이 단위로 한 줄씩 보여준다). */
export interface ScheduleRow {
  item_id: string;
  schedule_id: string;
  item_name: string;
  category: string;
  due_date: string | null;
  remind_before_value: number;
  remind_before_unit: TimeUnit;
  assignee_user_id: string | null;
  assignee_name?: string | null;
  status: ItemStatus;
  photo_url: string | null;
  custom_fields: Record<string, unknown>;
  completed_at: string | null;
}

export interface OrgMember {
  user_id: string;
  full_name: string;
  role: 'master' | 'manager' | 'member';
}

/** 조직이 자유롭게 추가/삭제하는 분류(카테고리) 목록. 기존엔 '보험/검사/기타'로 고정이었다. */
export interface CategoryOption {
  id: string;
  org_id: string;
  label: string;
  sort_order: number;
}

export type TabKeyName = 'upcoming' | 'calendar' | 'tracking' | 'profile';

/** 하단 4개 탭의 이름을 조직마다 원하는 대로 바꿀 수 있게 저장하는 값. */
export type TabLabels = Record<TabKeyName, string>;

export const DEFAULT_TAB_LABELS: TabLabels = {
  upcoming: '업무 알림',
  calendar: '캘린더',
  tracking: '작업추적/기록',
  profile: '내 정보',
};

export interface ExtractedDocumentFields {
  item_name: string;
  category: string | null;
  issuer: string | null;
  due_date: string | null;
  contract_period_start: string | null;
  amount: number | null;
  policy_or_document_number: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/** 항목에 첨부된 일반 문서 (PDF/엑셀/HWP/워드/TXT) - 구 file-extract-app 기능. */
export interface ItemDocument {
  id: string;
  item_id: string;
  org_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size: number;
  extracted_text: string | null;
  uploaded_by: string | null;
  created_at: string;
}
