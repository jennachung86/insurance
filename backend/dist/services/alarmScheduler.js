import cron from 'node-cron';
import { getServiceClient } from '../supabaseClient.js';
import { sendPushNotifications } from './notifiers/fcm.js';
import { sendSms } from './notifiers/sms.js';
import { sendKakaoAlimtalk } from './notifiers/kakao.js';
/**
 * 만료 예정 항목 하나에 대해 등록된 모든 채널로 알림을 보낸다.
 * (조직 공통 수신자 + 항목 전용 수신자 + 담당자 본인)
 */
async function dispatchAlarm(supabase, rule) {
    const item = rule.items;
    if (!item)
        return;
    const [{ data: recipients }, { data: assigneeProfile }] = await Promise.all([
        supabase
            .from('alarm_recipients')
            .select('phone_number, push_token')
            .eq('org_id', item.org_id)
            .or(`item_id.is.null,item_id.eq.${item.id}`),
        item.assignee_user_id
            ? supabase.from('profiles').select('phone_number, push_token').eq('id', item.assignee_user_id).single()
            : Promise.resolve({ data: null }),
    ]);
    const allRecipients = [...(recipients ?? []), ...(assigneeProfile ? [assigneeProfile] : [])];
    const phoneNumbers = [...new Set(allRecipients.map((r) => r.phone_number).filter(Boolean))];
    const pushTokens = [...new Set(allRecipients.map((r) => r.push_token).filter(Boolean))];
    const title = `[일정 알림] ${item.item_name}`;
    const body = `${item.category} 항목의 만료/납입일이 ${item.due_date ?? '미정'} 입니다. 확인해주세요.`;
    const logs = [];
    for (const channel of rule.channels) {
        try {
            if (channel === 'push') {
                const results = await sendPushNotifications(pushTokens, title, body, { item_id: item.id });
                for (const r of results) {
                    logs.push({
                        alarm_rule_id: rule.id,
                        item_id: item.id,
                        channel,
                        recipient: r.token,
                        status: r.ok ? 'sent' : 'failed',
                        error_message: r.error ?? null,
                    });
                }
            }
            else if (channel === 'sms') {
                const results = await sendSms(phoneNumbers, body);
                for (const r of results) {
                    logs.push({
                        alarm_rule_id: rule.id,
                        item_id: item.id,
                        channel,
                        recipient: r.recipient,
                        status: r.ok ? 'sent' : 'failed',
                        error_message: r.error ?? null,
                    });
                }
            }
            else if (channel === 'kakao') {
                const results = await sendKakaoAlimtalk(phoneNumbers, { itemName: item.item_name, dueDate: item.due_date ?? '미정' }, body);
                for (const r of results) {
                    logs.push({
                        alarm_rule_id: rule.id,
                        item_id: item.id,
                        channel,
                        recipient: r.recipient,
                        status: r.ok ? 'sent' : 'failed',
                        error_message: r.error ?? null,
                    });
                }
            }
        }
        catch (err) {
            console.error(`[alarm] ${channel} 채널 발송 실패:`, err);
            logs.push({
                alarm_rule_id: rule.id,
                item_id: item.id,
                channel,
                recipient: 'N/A',
                status: 'failed',
                error_message: err instanceof Error ? err.message : String(err),
            });
        }
    }
    if (logs.length > 0) {
        await supabase.from('alarm_logs').insert(logs);
    }
    // 발송 완료 - due_date가 갱신되기 전까지는 다시 울리지 않는다 (DB 트리거가 재활성화 담당)
    await supabase
        .from('alarm_rules')
        .update({ last_triggered_at: new Date().toISOString(), is_active: false })
        .eq('id', rule.id);
}
async function runDueAlarmsCheck() {
    const supabase = getServiceClient();
    const { data: dueRules, error } = await supabase
        .from('alarm_rules')
        .select(`id, item_id, channels,
       items ( id, org_id, item_name, category, due_date, assignee_user_id )`)
        .eq('is_active', true)
        .lte('next_trigger_at', new Date().toISOString());
    if (error) {
        console.error('[alarm] 만료 예정 알람 조회 실패:', error.message);
        return;
    }
    for (const rule of (dueRules ?? [])) {
        await dispatchAlarm(supabase, rule);
    }
    if (dueRules && dueRules.length > 0) {
        console.log(`[alarm] ${dueRules.length}건의 알람을 처리했습니다.`);
    }
}
/** 매 분마다 만료 예정 알람을 확인해 발송한다. */
export function startAlarmScheduler() {
    cron.schedule('* * * * *', () => {
        runDueAlarmsCheck().catch((err) => console.error('[alarm] 스케줄러 오류:', err));
    });
    console.log('[alarm] 알람 스케줄러 시작 (매 1분)');
}
