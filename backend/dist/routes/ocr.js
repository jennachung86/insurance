import { randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { parseDocumentImage } from '../services/claudeOcr.js';
import { getUserClient } from '../supabaseClient.js';
const SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
];
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (_req, file, cb) => {
        // Claude 비전은 HEIC/HEIF를 지원하지 않는다 - 모바일에서 JPEG로 촬영/변환해 보내야 한다.
        const ok = SUPPORTED_IMAGE_TYPES.includes(file.mimetype);
        if (!ok) {
            cb(new Error('지원하지 않는 이미지 형식입니다.'));
            return;
        }
        cb(null, true);
    },
});
/**
 * POST /api/ocr/parse
 * multipart/form-data:
 *   photo   - 사진 파일 (카메라 촬영 또는 갤러리)
 *   org_id  - 조직 id (신규 항목용 사진일 때 필요)
 *   item_id - 기존 항목에 재첨부하는 경우 (선택)
 *
 * 동작: 사진을 Supabase Storage에 저장 -> Claude Vision으로 텍스트/필드 추출
 * -> ocr_extractions 에 기록 -> 추출된 필드를 프론트로 반환 (프론트에서 셀에 자동 채움).
 */
router.post('/parse', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '사진 파일(photo)이 필요합니다.' });
        }
        const orgId = req.body.org_id;
        const itemId = req.body.item_id;
        if (!orgId && !itemId) {
            return res.status(400).json({ error: 'org_id 또는 item_id 중 하나는 필요합니다.' });
        }
        const supabase = getUserClient(req.accessToken);
        // item_id가 있으면 해당 항목이 속한 조직에 대한 접근 권한(RLS)을 확인 겸 조회
        let resolvedOrgId = orgId;
        if (itemId) {
            const { data: item, error: itemError } = await supabase
                .from('items')
                .select('id, org_id')
                .eq('id', itemId)
                .single();
            if (itemError || !item) {
                return res.status(404).json({ error: '항목을 찾을 수 없거나 접근 권한이 없습니다.' });
            }
            resolvedOrgId = item.org_id;
        }
        const mediaType = req.file.mimetype;
        const base64Data = req.file.buffer.toString('base64');
        // 1) Claude Vision으로 구조화된 필드 추출
        const extracted = await parseDocumentImage({ base64Data, mediaType });
        // 2) 원본 사진을 Storage에 업로드 (감사/재확인용)
        const ext = mediaType.split('/')[1] ?? 'jpg';
        const storagePath = `${resolvedOrgId}/${itemId ?? 'new'}/${randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
            .from('item-photos')
            .upload(storagePath, req.file.buffer, { contentType: mediaType, upsert: false });
        if (uploadError) {
            console.error('사진 업로드 실패:', uploadError.message);
            return res.status(500).json({ error: `사진 저장 실패: ${uploadError.message}` });
        }
        // 3) 추출 이력 저장 (item_id가 아직 없으면 null로 저장, 항목 생성 후 연결)
        const { data: extraction, error: insertError } = await supabase
            .from('ocr_extractions')
            .insert({
            item_id: itemId ?? null,
            photo_storage_path: storagePath,
            model: 'claude-opus-5',
            extracted_fields: extracted,
            confidence: extracted.confidence,
        })
            .select('id')
            .single();
        if (insertError) {
            console.error('OCR 이력 저장 실패:', insertError.message);
        }
        // 기존 항목에 대한 재첨부라면 photo_url도 바로 갱신
        if (itemId) {
            await supabase.from('items').update({ photo_url: storagePath }).eq('id', itemId);
            await supabase.from('item_photos').insert({ item_id: itemId, storage_path: storagePath });
        }
        res.json({
            extraction_id: extraction?.id ?? null,
            storage_path: storagePath,
            extracted_fields: extracted,
        });
    }
    catch (err) {
        console.error('OCR 처리 실패:', err);
        const message = err instanceof Error ? err.message : 'OCR 처리 중 오류가 발생했습니다.';
        res.status(500).json({ error: message });
    }
});
export default router;
