import { createHash, randomInt, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { sendSms } from './notifiers/sms.js';

export type RecoveryChannel = 'email' | 'sms';
export type RecoveryPurpose = 'find-id' | 'reset-password';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

// 인스턴스 1대로 운영하는 소규모 서비스라 메모리에 보관한다. (재시작되면 미사용 코드는 사라지고 다시 요청하면 됨)
const store = new Map<string, OtpRecord>();

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function normalizeTarget(channel: RecoveryChannel, target: string): string {
  return channel === 'email' ? target.trim().toLowerCase() : target.replace(/\D/g, '');
}

function keyOf(purpose: RecoveryPurpose, channel: RecoveryChannel, target: string, loginId?: string): string {
  return [purpose, channel, target, loginId ?? ''].join('|');
}

export function isChannelConfigured(channel: RecoveryChannel): boolean {
  if (channel === 'email') {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_PHONE);
}

async function deliver(channel: RecoveryChannel, target: string, code: string): Promise<void> {
  const text = `[일정 공동관리] 인증번호 ${code} (5분 이내 입력)`;
  if (channel === 'sms') {
    const [result] = await sendSms([target], text);
    if (!result?.ok) throw new Error(result?.error || '문자 발송에 실패했습니다.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: target,
    subject: '[일정 공동관리] 본인 확인 인증번호',
    text,
  });
}

/**
 * 인증번호를 만들어 발송한다. 재전송 쿨다운 중이면 아무것도 보내지 않고 쿨다운 초를 반환한다.
 * 계정 존재 여부와 무관하게 호출하지 말 것 - 호출 측에서 실제 가입 정보가 확인된 경우에만 부른다.
 */
export async function sendOtp(params: {
  purpose: RecoveryPurpose;
  channel: RecoveryChannel;
  target: string;
  loginId?: string;
}): Promise<{ cooldownSeconds: number }> {
  const key = keyOf(params.purpose, params.channel, params.target, params.loginId);
  const existing = store.get(key);
  const now = Date.now();
  if (existing && now - existing.sentAt < RESEND_COOLDOWN_MS) {
    return { cooldownSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.sentAt)) / 1000) };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await deliver(params.channel, params.target, code);
  store.set(key, { codeHash: hashCode(code), expiresAt: now + CODE_TTL_MS, sentAt: now, attempts: 0 });
  return { cooldownSeconds: 0 };
}

/** 인증번호가 맞으면 true(그리고 1회용으로 폐기). 시도 횟수 초과/만료/불일치는 false. */
export function verifyOtp(params: {
  purpose: RecoveryPurpose;
  channel: RecoveryChannel;
  target: string;
  loginId?: string;
  code: string;
}): boolean {
  const key = keyOf(params.purpose, params.channel, params.target, params.loginId);
  const record = store.get(key);
  if (!record) return false;
  if (Date.now() > record.expiresAt || record.attempts >= MAX_ATTEMPTS) {
    store.delete(key);
    return false;
  }
  record.attempts += 1;

  const a = Buffer.from(hashCode(params.code.trim()), 'hex');
  const b = Buffer.from(record.codeHash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  store.delete(key);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store) {
    if (now > record.expiresAt) store.delete(key);
  }
}, 60 * 1000).unref();
