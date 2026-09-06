import { solapiRequest } from './solapiClient.js';
/** 일반 문자(SMS/LMS)를 여러 수신번호에 전송한다. */
export async function sendSms(phoneNumbers, text) {
    const from = process.env.SOLAPI_SENDER_PHONE;
    if (!from)
        throw new Error('SOLAPI_SENDER_PHONE 환경변수가 설정되지 않았습니다.');
    if (phoneNumbers.length === 0)
        return [];
    const results = [];
    for (const to of phoneNumbers) {
        try {
            await solapiRequest('/messages/v4/send', {
                message: { to, from, text },
            });
            results.push({ recipient: to, ok: true });
        }
        catch (err) {
            results.push({ recipient: to, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return results;
}
