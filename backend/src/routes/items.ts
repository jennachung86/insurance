import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { getUserClient } from '../supabaseClient.js';

const router = Router();

/**
 * POST /api/items/:id/apply-ocr
 * OCR로 추출한 필드를 사용자가 검토한 뒤 실제 항목(items) 레코드에 반영한다.
 * items의 나머지 CRUD(생성/목록/수정/삭제)는 모바일 앱이 Supabase 클라이언트로
 * RLS 하에 직접 수행한다 - 이 엔드포인트는 "OCR 자동 등록" 흐름만 마무리한다.
 */
router.post('/:id/apply-ocr', requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { extraction_id, fields } = req.body as {
    extraction_id?: string;
    fields: {
      item_name?: string;
      category?: string;
      due_date?: string | null;
      custom_fields?: Record<string, unknown>;
    };
  };

  if (!fields) {
    return res.status(400).json({ error: '적용할 fields가 필요합니다.' });
  }

  const supabase = getUserClient(req.accessToken!);

  const { data: updated, error } = await supabase
    .from('items')
    .update({
      ...(fields.item_name ? { item_name: fields.item_name } : {}),
      ...(fields.category ? { category: fields.category } : {}),
      ...(fields.due_date !== undefined ? { due_date: fields.due_date } : {}),
      ...(fields.custom_fields ? { custom_fields: fields.custom_fields } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  if (extraction_id) {
    await supabase.from('ocr_extractions').update({ applied: true }).eq('id', extraction_id);
  }

  res.json({ item: updated });
});

export default router;
