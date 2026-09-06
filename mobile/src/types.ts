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

export interface ScheduleItem {
  id: string;
  org_id: string;
  item_name: string;
  category: string;
  due_date: string | null; // YYYY-MM-DD
  remind_before_value: number;
  remind_before_unit: TimeUnit;
  assignee_user_id: string | null;
  assignee_name?: string | null; // 조인해서 채움
  status: ItemStatus;
  photo_url: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface OrgMember {
  user_id: string;
  full_name: string;
  role: 'master' | 'manager' | 'member';
}

export interface ExtractedDocumentFields {
  item_name: string;
  category: '보험' | '검사' | '기타';
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
