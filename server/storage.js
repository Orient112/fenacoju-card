import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, isSupabaseEnabled, STORAGE_BUCKET } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function getExtension(file) {
  const fromName = path.extname(file.originalname || '');
  if (fromName) return fromName;
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return mimeMap[file.mimetype] || '';
}

export async function saveUploadedFile(file, folder = 'uploads') {
  if (!file) return '';

  const ext = getExtension(file);
  const filename = `${uuidv4()}${ext}`;

  if (isSupabaseEnabled()) {
    const supabase = getSupabase();
    const storagePath = `${folder}/${filename}`;
    const buffer = file.buffer || fs.readFileSync(file.path);

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) throw new Error(`Erreur upload Supabase: ${error.message}`);

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  const localPath = path.join(uploadsDir, filename);
  if (file.buffer) {
    fs.writeFileSync(localPath, file.buffer);
  } else if (file.path) {
    fs.renameSync(file.path, localPath);
  }
  return `/uploads/${filename}`;
}

export async function deleteStoredFile(fileUrl) {
  if (!fileUrl) return;

  if (isSupabaseEnabled() && fileUrl.includes('supabase')) {
    try {
      const supabase = getSupabase();
      const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
      const idx = fileUrl.indexOf(marker);
      if (idx === -1) return;
      const storagePath = fileUrl.slice(idx + marker.length);
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // Ignorer les erreurs de suppression distante
    }
    return;
  }

  if (fileUrl.startsWith('/uploads/')) {
    const localPath = path.join(__dirname, '..', fileUrl);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
}
