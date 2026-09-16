import type { NextFunction, Request, Response } from 'express';

export interface AuthedRequest extends Request {
  accessToken?: string;
  // multer가 채워주는 필드. @types/multer를 안 쓰므로(src/types/multer.d.ts 참고) 여기서 직접 선언한다.
  file?: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
}

/**
 * Supabase Auth 액세스 토큰을 Authorization: Bearer <token> 헤더에서 꺼낸다.
 * 실제 사용자 검증은 이 토큰으로 만든 Supabase 클라이언트가 RLS를 통해 수행한다
 * (getUserClient) - 여기서는 형식만 확인한다.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다 (Authorization: Bearer <token>).' });
  }
  req.accessToken = header.slice('Bearer '.length);
  next();
}
