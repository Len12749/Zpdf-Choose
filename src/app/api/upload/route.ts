export const dynamic = "force-dynamic";

import { success, error } from '@/lib/api-response';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'temp');
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 200;
const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/bmp',
  'image/webp',
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) return error('请上传文件');
    if (files.length > MAX_FILES) return error(`最多上传${MAX_FILES}个文件`);

    const uploadId = uuidv4();
    const uploadDir = path.join(UPLOAD_DIR, uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const fileInfo: { filename: string; type: string; size: number }[] = [];

    for (const [index, file] of files.entries()) {
      if (file.size > MAX_FILE_SIZE) {
        return error(`文件 ${file.name} 超过50MB限制`);
      }

      const ext = path.extname(file.name).toLowerCase();
      const isAllowed = ALLOWED_TYPES.includes(file.type) ||
        ['.pdf', '.txt', '.md', '.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext);

      if (!isAllowed) {
        return error(`不支持的文件类型: ${file.name}`);
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const safeName = file.name.replace(/[\\/:"*?<>|]+/g, '_');
      const storedName = `${String(index + 1).padStart(4, '0')}_${safeName}`;
      const filePath = path.join(uploadDir, storedName);
      fs.writeFileSync(filePath, buffer);

      fileInfo.push({
        filename: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    return success({ uploadId, files: fileInfo });
  } catch (e) {
    return error(String(e), 500);
  }
}
