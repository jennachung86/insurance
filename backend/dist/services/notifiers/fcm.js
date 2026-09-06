import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
function ensureApp() {
    if (getApps().length > 0)
        return;
    initializeApp({
        credential: cert({
            projectId: process.env.FCM_PROJECT_ID,
            clientEmail: process.env.FCM_CLIENT_EMAIL,
            // .env 파일에서 개행이 \n 문자열로 저장되므로 실제 개행으로 복원
            privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}
/** FCM 앱 푸시 알림을 여러 기기 토큰에 전송한다. */
export async function sendPushNotifications(tokens, title, body, data) {
    if (tokens.length === 0)
        return [];
    ensureApp();
    const messaging = getMessaging();
    const results = await Promise.allSettled(tokens.map((token) => messaging.send({ token, notification: { title, body }, data })));
    return results.map((result, i) => ({
        token: tokens[i],
        ok: result.status === 'fulfilled',
        error: result.status === 'rejected' ? String(result.reason) : undefined,
    }));
}
