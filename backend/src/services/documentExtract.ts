import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const client = new Anthropic();

export const SUPPORTED_DOCUMENT_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.hwp', '.docx', '.txt'] as const;
export type SupportedDocumentExtension = (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number];

export const ExtractedDocumentFields = z.object({
  item_name: z.string().nullable().describe('항목명 (예: 건강검진, 자동차 보험, 차량번호+차종)'),
  category: z
    .string()
    .nullable()
    .describe('분류 - "보험"/"검사"처럼 일반적인 이름이면 그대로, 표 제목/맥락에 맞는 더 구체적인 이름(예: "자동차검사", "콤프레서검사")도 자유롭게 사용 가능'),
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

export type ExtractedDocumentFields = z.infer<typeof ExtractedDocumentFields>;

/**
 * 보험증권 PDF, 검사표 스캔본, 엑셀 명단 등 일반 문서에서 텍스트를 추출한다.
 * (사진 한 장에서 셀 항목을 자동 채우는 Claude Vision OCR과는 별개의 기능 -
 * 이건 원본 문서 전체 텍스트를 그대로 보여주고 첨부/보관하기 위한 용도)
 */
export async function extractDocumentText(buffer: Buffer, ext: SupportedDocumentExtension): Promise<string> {
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
      const _exhaustive: never = ext;
      throw new Error(`지원하지 않는 파일 형식입니다: ${_exhaustive}`);
    }
  }
}

/**
 * PDF/Excel/Word/HWP 문서를 Claude로 분석해 항목 정보를 구조화된 필드로 추출한다.
 * 사진 OCR과 동일한 ExtractedDocumentFields 스키마를 사용하므로,
 * 추출 결과를 바로 항목 셀에 자동 채울 수 있다.
 */
export async function analyzeDocumentWithClaude(
  buffer: Buffer,
  ext: SupportedDocumentExtension
): Promise<ExtractedDocumentFields> {
  const extractedText = await extractDocumentText(buffer, ext);

  const outputFormat = betaZodOutputFormat(ExtractedDocumentFields);

  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 2048,
    system:
      '너는 보험 증권, 검사 확인서, 납입 영수증 등의 문서에서 관리용 일정 데이터를 추출하는 어시스턴트다. ' +
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

  const textBlock = response.content.find(
    (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text'
  );
  if (!textBlock) {
    throw new Error('Claude가 문서에서 구조화된 데이터를 추출하지 못했습니다.');
  }

  return outputFormat.parse(textBlock.text);
}

const BulkExtractionResult = z.object({
  items: z.array(ExtractedDocumentFields).describe('표에서 추출한 관리 항목들의 목록 (한 행 = 한 항목)'),
});

/**
 * 엑셀 명단, 장비 목록표처럼 "한 파일 안에 여러 개의 관리 항목(행)"이 들어있는 문서를
 * Claude로 한 번에 분석해 항목 배열로 추출한다. (analyzeDocumentWithClaude는 항목 1개만 추출)
 * 예: 차량 20대의 검사현황표 -> 차량 20개 각각을 별도 항목으로 추출.
 */
export async function analyzeDocumentBulk(
  buffer: Buffer,
  ext: SupportedDocumentExtension
): Promise<ExtractedDocumentFields[]> {
  const extractedText = await extractDocumentText(buffer, ext);

  const outputFormat = betaZodOutputFormat(BulkExtractionResult);

  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system:
      '너는 장비 목록표, 차량 명단, 계약 목록 등 "표 형태로 여러 건이 나열된 문서"에서 ' +
      '관리용 일정 데이터를 각 행(항목)마다 하나씩 추출하는 어시스턴트다.\n' +
      '- 표의 각 행이 독립된 관리 대상(차량/장비/계약 등)이면 그 행 각각을 별도의 항목으로 만들어라.\n' +
      '- 여러 시트가 있으면 모든 시트를 처리하고, 시트 제목/표 제목을 분류(category)에 참고해라 ' +
      '(예: "자동차" 시트의 검사 항목은 category를 "자동차검사"처럼 구체적으로 지어도 좋다).\n' +
      '- 한 대상에 대해 "검사 유효기간"과 "보험 가입기간"이 둘 다 있으면, 같은 item_name으로 ' +
      '검사 항목 1개 + 보험 항목 1개, 총 2개의 항목으로 나눠서 추출해라.\n' +
      '- item_name은 표에서 가장 식별하기 좋은 이름으로 만들어라 (예: "82고5555 현대5톤트럭").\n' +
      '- "매각", "폐차", "무등록"처럼 날짜가 아닌 값은 due_date를 null로 하고 notes에 그 사실을 남겨라.\n' +
      '- 날짜는 반드시 YYYY-MM-DD 형식으로 변환해라 (예: "7/18/26" -> "2026-07-18", 2자리 연도는 20XX로 해석).\n' +
      '- 빈 행, 안내문/범례성 텍스트, 헤더 행은 항목으로 만들지 마라.\n' +
      '- 문서에 실제로 적힌 값만 사용하고, 확실하지 않으면 null로 남겨라.\n' +
      '- 정비/오일교환 이력처럼 "예정된 만료일이 없는 단순 작업 기록"은 항목으로 만들지 마라.',
    messages: [
      {
        role: 'user',
        content: `이 표 문서에서 관리해야 할 항목들을 모두 각각 추출해줘.\n\n문서 내용:\n${extractedText}`,
      },
    ],
    output_format: outputFormat,
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text'
  );
  if (!textBlock) {
    throw new Error('Claude가 문서에서 구조화된 데이터를 추출하지 못했습니다.');
  }

  return outputFormat.parse(textBlock.text).items;
}

/**
 * HWP는 OLE 바이너리 포맷이라 전용 파서 없이는 완전한 추출이 어렵다.
 * UTF-16LE(HWP가 문단 텍스트를 저장하는 방식)와 ASCII 가독 구간을 스캔하는
 * 휴리스틱 방식 - 완벽하진 않지만 핵심 텍스트는 대부분 잡아낸다.
 */
function extractHwpTextFromBytes(buffer: Buffer): string {
  const chunks: string[] = [];

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
