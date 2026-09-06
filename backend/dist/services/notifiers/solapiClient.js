import { createHmac, randomBytes } from 'crypto';
const SOLAPI_BASE_URL = 'https://api.solapi.com';
/**
 * Solapi(국내 SMS/카카오 알림톡 대행사) HMAC-SHA256 인증 헤더 생성.
 * 참고: 실제 서비스 적용 전 Solapi 최신 문서로 서명 규격을 재확인할 것
 * (https://developers.solapi.com) - 대행사가 다르면(예: Aligo, NHN Cloud) 이 파일만 교체하면 된다.
 */
function buildAuthHeader() {
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    if (!apiKey || !apiSecret) {
        throw new Error('SOLAPI_API_KEY / SOLAPI_API_SECRET 환경변수가 설정되지 않았습니다.');
    }
    const date = new Date().toISOString();
    const salt = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
export async function solapiRequest(path, body) {
    const res = await fetch(`${SOLAPI_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: buildAuthHeader(),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Solapi 요청 실패 (${res.status}): ${text}`);
    }
    return (await res.json());
}
