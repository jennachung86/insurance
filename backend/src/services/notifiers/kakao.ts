import { solapiRequest } from './solapiClient.js';
import type { SendResult } from './sms.js';

/**
 * 카카오 알림톡(AlimTalk) 발송. 사전에 Solapi 콘솔에서 발신 프로필(카카오 비즈니스 채널)과
 * 템플릿을 등록/승인받아야 하며, 템플릿 변수(#{name} 등)는 실제 승인된 템플릿과 일치해야 한다.
 */
export async function sendKakaoAlimtalk(
  phoneNumbers: string[],
  variables: Record<string, string>,
  fallbackText: string
): Promise<SendResult[]> {
  const from = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_KAKAO_PF_ID;
  const templateId = process.env.SOLAPI_KAKAO_TEMPLATE_ID;
  if (!from || !pfId || !templateId) {
    throw new Error('SOLAPI_SENDER_PHONE / SOLAPI_KAKAO_PF_ID / SOLAPI_KAKAO_TEMPLATE_ID 환경변수가 필요합니다.');
  }
  if (phoneNumbers.length === 0) return [];

  const results: SendResult[] = [];
  for (const to of phoneNumbers) {
    try {
      await solapiRequest('/messages/v4/send', {
        message: {
          to,
          from,
          kakaoOptions: {
            pfId,
            templateId,
            variables,
            // 알림톡 실패 시 일반 문자(LMS)로 자동 대체 발송
            disableSms: false,
          },
          text: fallbackText,
        },
      });
      results.push({ recipient: to, ok: true });
    } catch (err) {
      results.push({ recipient: to, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
