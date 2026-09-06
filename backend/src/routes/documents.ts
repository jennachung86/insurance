import path from 'path';
import { randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  extractDocumentText,
  analyzeDocumentWithClaude,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  type SupportedDocumentExtension,
} from '../services/documentExtract.js';
import { getUserClient } from '../supabaseClient.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = (SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
    if (!ok) {
      cb(new Error(`지원하지 않는 파일 형식입니다: ${ext}`));
      return;
    }
    cb(null, true);
  },
});

/**
 * POST /api/documents/upload
 * multipart/form-data:
 *   file    - 문서 파일 (.pdf, .xlsx, .xls, .hwp, .docx, .txt)
 *   item_id - 첨부할 항목 id (필수 - 항목을 먼저 저장한 뒤에만 문서를 첨부할 수 있다)
 *
 * 동작: 파일을 텍스트로 추출하고 Storage에 저장 후 DB 기록. 셀 자동 채움은 하지 않음.
 */
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일(file)이 필요합니다.' });
    }
    const itemId = req.body.item_id as string | undefined;
    if (!itemId) {
      return res.status(400).json({ error: 'item_id가 필요합니다. 항목을 먼저 저장한 뒤 문서를 첨부하세요.' });
    }

    const supabase = getUserClient(req.accessToken!);

    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, org_id')
      .eq('id', itemId)
      .single();
    if (itemError || !item) {
      return res.status(404).json({ error: '항목을 찾을 수 없거나 접근 권한이 없습니다.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase() as SupportedDocumentExtension;
    const extractedText = await extractDocumentText(req.file.buffer, ext);

    const storagePath = `${item.org_id}/${itemId}/${randomUUID()}${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('item-documents')
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (uploadError) {
      return res.status(500).json({ error: `파일 저장 실패: ${uploadError.message}` });
    }

    const { data: record, error: insertError } = await supabase
      .from('item_documents')
      .insert({
        item_id: itemId,
        org_id: item.org_id,
        original_name: req.file.originalname,
        storage_path: storagePath,
        mime_type: req.file.mimetype,
        size: req.file.size,
        extracted_text: extractedText,
      })
      .select()
      .single();

    if (insertError || !record) {
      return res.status(500).json({ error: `첨부 기록 실패: ${insertError?.message}` });
    }

    res.json({ document: record });
  } catch (err) {
    console.error('문서 업로드/추출 실패:', err);
    const message = err instanceof Error ? err.message : '문서 처리 중 오류가 발생했습니다.';
    res.status(500).json({ error: message });
  }
});

/** GET /api/documents/:id/text - 저장된 문서의 텍스트를 다시 조회 (재확인용) */
router.get('/:id/text', requireAuth, async (req: AuthedRequest, res) => {
  const supabase = getUserClient(req.accessToken!);
  const { data: doc, error } = await supabase
    .from('item_documents')
    .select('extracted_text')
    .eq('id', req.params.id)
    .single();

  if (error || !doc) {
    return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });
  }
  res.json({ text: doc.extracted_text });
});

/** DELETE /api/documents/:id - 문서 삭제 (Storage 원본 + 레코드) */
router.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const supabase = getUserClient(req.accessToken!);

  const { data: doc, error: fetchError } = await supabase
    .from('item_documents')
    .select('id, storage_path')
    .eq('id', req.params.id)
    .single();
  if (fetchError || !doc) {
    return res.status(404).json({ error: '문서를 찾을 수 없거나 삭제 권한이 없습니다.' });
  }

  const { error: deleteRowError } = await supabase.from('item_documents').delete().eq('id', doc.id);
  if (deleteRowError) {
    return res.status(400).json({ error: deleteRowError.message });
  }

  await supabase.storage.from('item-documents').remove([doc.storage_path]);

  res.json({ ok: true });
});

/**
 * POST /api/documents/analyze
 * multipart/form-data:
 *   file - 문서 파일 (.pdf, .xlsx, .xls, .hwp, .docx, .txt)
 *
 * 동작: 문서를 Claude로 분석해 항목 정보(항목명, 만료일, 금액 등)를 구조화된 필드로 추출해 반환.
 * 사진 OCR과 동일한 스키마를 사용하므로 추출 결과를 바로 항목 셀에 자동 채울 수 있다.
 */
router.post('/analyze', requireAuth, upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일(file)이 필요합니다.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase() as SupportedDocumentExtension;
    const extracted = await analyzeDocumentWithClaude(req.file.buffer, ext);

    res.json({
      extracted_fields: extracted,
    });
  } catch (err) {
    console.error('문서 분석 실패:', err);
    const message = err instanceof Error ? err.message : '문서 분석 중 오류가 발생했습니다.';
    res.status(500).json({ error: message });
  }
});

export default router;
