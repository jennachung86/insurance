import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import ocrRoutes from './routes/ocr.js';
import itemsRoutes from './routes/items.js';
import documentsRoutes from './routes/documents.js';
import { startAlarmScheduler } from './services/alarmScheduler.js';

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 라우터를 as any로 전달: multer 미들웨어가 끌어오는 @types/multer의 중첩된
// @types/express 사본이 (Render 배포 환경에서만) express-serve-static-core 버전
// 충돌을 일으켜 app.use/app.get의 오버로드 해석이 깨지는 경우가 있다.
// skipLibCheck는 .d.ts 파일 간의 충돌은 걸러주지 못하므로 여기서 명시적으로 우회한다.
app.use('/api/ocr', ocrRoutes as any);
app.use('/api/items', itemsRoutes as any);
app.use('/api/documents', documentsRoutes as any);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`OCR/알람/문서추출 API 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  startAlarmScheduler();
});

// 대용량 문서를 Claude로 분석하는 요청은 오래 걸릴 수 있으므로
// Node 서버 자체의 기본 타임아웃(응답이 없으면 소켓을 끊는 시간)을 넉넉하게 늘려둔다.
server.timeout = 300000; // 5분
server.headersTimeout = 305000;
server.keepAliveTimeout = 300000;
