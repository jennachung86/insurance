import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
}
/**
 * 서비스 롤 클라이언트 - RLS를 우회한다. 알람 스케줄러처럼 사용자 컨텍스트가
 * 없는 백그라운드 작업에서만 사용할 것. 절대 프론트엔드에 키를 노출하지 않는다.
 */
export function getServiceClient() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });
}
/**
 * 요청 헤더의 사용자 액세스 토큰으로 동작하는 클라이언트. anon key를 기반으로 하되
 * Authorization을 사용자 JWT로 덮어써서, PostgREST가 auth.uid()를 그 사용자로 인식하고
 * RLS("이 사용자가 이 조직 멤버인가")를 정상적으로 적용하도록 한다.
 */
export function getUserClient(accessToken) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}
