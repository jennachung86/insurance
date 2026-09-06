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

app.use('/api/ocr', ocrRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/documents', documentsRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`OCR/알람/문서추출 API 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  startAlarmScheduler();
});
