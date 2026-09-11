import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL);

export const dataDir = isVercel
  ? path.join('/tmp', 'fenacoju-data')
  : path.join(__dirname, '..', 'data');

export const uploadsDir = isVercel
  ? path.join('/tmp', 'fenacoju-uploads')
  : path.join(__dirname, '..', 'uploads');

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(dataDir);
ensureDir(uploadsDir);
