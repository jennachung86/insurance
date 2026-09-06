import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
// API 키가 없으면 SDK가 `ant auth login` 프로필을 자동으로 사용한다.
const client = new Anthropic();
const MODEL = 'claude-opus-5';
export const ExtractedDocumentFields = z.object({
    item_name: z
        .string()
        .describe('문서에서 식별한 항목명 (예: "자동차보험 - 삼성화재", "정기 소방시설 점검")'),
    category: z
        .enum(['보험', '검사', '기타'])
        .describe('문서 종류 분류'),
    issuer: z
        .string()
        .nullable()
        .describe('보험사/발급기관/검사기관 이름. 문서에 없으면 null'),
    due_date: z
        .string()
        .nullable()
        .describe('만료일 또는 다음 납입일. ISO 형식 YYYY-MM-DD. 알 수 없으면 null'),
    contract_period_start: z
        .string()
        .nullable()
        .describe('보험/계약 시작일. ISO 형식 YYYY-MM-DD. 없으면 null'),
    amount: z
        .number()
        .nullable()
        .describe('납입 금액 또는 보험료(원). 숫자만. 알 수 없으면 null'),
    policy_or_document_number: z
        .string()
        .nullable()
        .describe('증권번호, 계약번호, 검사번호 등 문서 고유번호. 없으면 null'),
    notes: z
        .string()
        .nullable()
        .describe('그 외 자동 입력에 참고할 만한 짧은 메모 (1문장 이내)'),
    confidence: z
        .enum(['high', 'medium', 'low'])
        .describe('추출 결과에 대한 모델 자신의 확신도'),
});
/**
 * 영수증/보험증권/검사표 사진을 Claude Vision + 구조화된 출력(betaZodOutputFormat)으로
 * 파싱해 셀에 바로 채워 넣을 수 있는 필드로 반환한다.
 *
 * 참고: 설치된 @anthropic-ai/sdk 버전에서 client.beta.messages.parse()의 반환 타입은
 * output_format 파라미터로부터 parsed_output의 타입을 안정적으로 추론하지 못하는
 * 제네릭 한계가 있다. 이를 피하기 위해 .create() + outputFormat.parse(text) 조합을
 * 직접 사용한다 - AutoParseableBetaOutputFormat 자체가 파싱 함수를 갖고 있어 동일한
 * 검증 효과를 얻으면서도 타입이 명확하다.
 */
export async function parseDocumentImage({ base64Data, mediaType, }) {
    const outputFormat = betaZodOutputFormat(ExtractedDocumentFields);
    const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: '너는 보험 증권, 검사 확인서, 납입 영수증 사진에서 관리용 일정 데이터를 추출하는 어시스턴트다. ' +
            '문서에 실제로 적힌 값만 사용하고, 확실하지 않으면 추측해서 채우지 말고 null로 남겨라. ' +
            '날짜는 반드시 YYYY-MM-DD 형식으로 변환해라 (예: "2026년 3월 15일" -> "2026-03-15").',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: base64Data },
                    },
                    {
                        type: 'text',
                        text: '이 문서에서 항목명, 분류, 발급기관, 만료일/납입일, 계약 시작일, 금액, 문서번호를 추출해줘.',
                    },
                ],
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
