import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
const client = new Anthropic();
export const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.hwp', '.docx', '.txt'];
export const ExtractedDocumentFields = z.object({
    item_name: z.string().nullable().describe('항목명 (예: 건강검진, 자동차 보험)'),
    category: z.enum(['보험', '검사', '기타']).nullable().describe('분류'),
    issuer: z.string().nullable().describe('발급/발행기관 (예: 국민건강보험, 삼성화재)'),
    due_date: z.string().nullable().describe('만료일 또는 검사 만료예정일 (YYYY-MM-DD 형식)'),
    contract_period_start: z.string().nullable().describe('계약 시작일 (YYYY-MM-DD 형식)'),
    amount: z.number().nullable().describe('금액/보험료 (숫자만)'),
    policy_or_document_number: z.string().nullable().describe('문서번호/계약번호/검사번호'),
    notes: z
        .string()
        .nullable()
        .describe('그 외 자동 입력에 참고할 만한 짧은 메모 (1문장 이내)'),
    confidence: z
        .enum(['high', 'medium', 'low'])
        .describe('추출 결과에 대한 모델 자신의 확신도'),
});
/**
 * 보험증권 PDF, 검사표 스캔본, 엑셀 명단 등 일반 문서에서 텍스트를 추출한다.
 * (사진 한 장에서 셀 항목을 자동 채우는 Claude Vision OCR과는 별개의 기능 -
 * 이건 원본 문서 전체 텍스트를 그대로 보여주고 첨부/보관하기 위한 용도)
 */
export async function extractDocumentText(buffer, ext) {
    switch (ext) {
        case '.pdf': {
            const result = await pdfParse(buffer);
            return result.text.trim();
        }
        case '.xlsx':
        case '.xls': {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const parts = workbook.SheetNames.map((sheetName) => {
                const sheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                return `--- ${sheetName} ---\n${csv}`;
            });
            return parts.join('\n\n').trim();
        }
        case '.docx': {
            const result = await mammoth.extractRawText({ buffer });
            return result.value.trim();
        }
        case '.hwp':
            return extractHwpTextFromBytes(buffer);
        case '.txt':
            return buffer.toString('utf8').trim();
        default: {
            const _exhaustive = ext;
            throw new Error(`지원하지 않는 파일 형식입니다: ${_exhaustive}`);
        }
    }
}
/**
 * PDF/Excel/Word/HWP 문서를 Claude로 분석해 항목 정보를 구조화된 필드로 추출한다.
 * 사진 OCR과 동일한 ExtractedDocumentFields 스키마를 사용하므로,
 * 추출 결과를 바로 항목 셀에 자동 채울 수 있다.
 */
export async function analyzeDocumentWithClaude(buffer, ext) {
    const extractedText = await extractDocumentText(buffer, ext);
    const outputFormat = betaZodOutputFormat(ExtractedDocumentFields);
    const response = await client.beta.messages.create({
        model: 'claude-opus-5',
        max_tokens: 2048,
        system: '너는 보험 증권, 검사 확인서, 납입 영수증 등의 문서에서 관리용 일정 데이터를 추출하는 어시스턴트다. ' +
            '문서에 실제로 적힌 값만 사용하고, 확실하지 않으면 추측해서 채우지 말고 null로 남겨라. ' +
            '날짜는 반드시 YYYY-MM-DD 형식으로 변환해라 (예: "2026년 3월 15일" -> "2026-03-15").',
        messages: [
            {
                role: 'user',
                content: `이 문서에서 항목명, 분류, 발급기관, 만료일/납입일, 계약 시작일, 금액, 문서번호를 추출해줘.\n\n문서 내용:\n${extractedText}`,
            },
        ],
        output_format: outputFormat,
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
        throw new Error('Claude가 문서에서 구조화된 데이터를 추출하지 못했습니다.');
    }
    return outputFormat.parse(textBlock.text);
}
/**
 * HWP는 OLE 바이너리 포맷이라 전용 파서 없이는 완전한 추출이 어렵다.
 * UTF-16LE(HWP가 문단 텍스트를 저장하는 방식)와 ASCII 가독 구간을 스캔하는
 * 휴리스틱 방식 - 완벽하진 않지만 핵심 텍스트는 대부분 잡아낸다.
 */
function extractHwpTextFromBytes(buffer) {
    const chunks = [];
    const utf16 = buffer.toString('utf16le');
    const utf16Runs = utf16.match(/[가-힣ㄱ-ㆎ\w\s.,!?()%\-:/]{4,}/g) || [];
    chunks.push(...utf16Runs);
    const ascii = buffer.toString('latin1');
    const asciiRuns = ascii.match(/[\x20-\x7E]{6,}/g) || [];
    chunks.push(...asciiRuns);
    const cleaned = chunks.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 4);
    const unique = Array.from(new Set(cleaned));
    return unique.join('\n').trim() || '(추출 가능한 텍스트를 찾지 못했습니다. HWP 바이너리 구조상 일부 내용만 인식될 수 있습니다.)';
}
