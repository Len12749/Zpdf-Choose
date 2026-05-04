import { success, error } from '@/lib/api-response';
import { db } from '@/lib/db';
import { extractQuestionsFromImage, extractQuestionsFromText, repairIncompleteQuestions } from '@/lib/siliconflow';
import { processInParallel } from '@/lib/parallel-processor';
import { mergeExtractionResults } from '@/lib/question-matcher';
import { ExtractionResult } from '@/types/question';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'temp');
const EXTRACTION_LOG_PREFIX = '[extract]';

type JobPhase = 'extracting' | 'merging' | 'optimizing' | 'completed' | 'error';

interface ExtractionJob {
  status: 'processing' | 'completed' | 'error';
  phase: JobPhase;
  step: number;
  totalSteps: number;
  stepLabel: string;
  phaseProcessed: number;
  phaseTotal: number;
  processedPages: number;
  totalPages: number;
  questionsFound: number;
  failedPages: number;
  emptyPages: number;
  warnings: string[];
  pageLogs: Array<{
    pageNumber: number;
    rawContent?: string;
    parsedData?: ExtractionResult;
    error?: string;
  }>;
  error?: string;
}

const jobs = new Map<string, ExtractionJob>();

function createInitialJob(): ExtractionJob {
  return {
    status: 'processing',
    phase: 'extracting',
    step: 1,
    totalSteps: 3,
    stepLabel: '文本提取中',
    phaseProcessed: 0,
    phaseTotal: 1,
    processedPages: 0,
    totalPages: 0,
    questionsFound: 0,
    failedPages: 0,
    emptyPages: 0,
    warnings: [],
    pageLogs: [],
  };
}

function updateJobPhase(
  jobId: string,
  phase: JobPhase,
  step: number,
  stepLabel: string,
  phaseProcessed: number,
  phaseTotal: number
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.phase = phase;
  job.step = step;
  job.totalSteps = 3;
  job.stepLabel = stepLabel;
  job.phaseProcessed = phaseProcessed;
  job.phaseTotal = Math.max(phaseTotal, 1);
}

async function convertPdfToImages(pdfBuffer: Buffer): Promise<{ pageNumber: number; imageBuffer: Buffer }[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  if (typeof globalThis.DOMMatrix === 'undefined') {
    const { DOMMatrix } = await import('canvas');
    (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const doc = await loadingTask.promise;
  const pages: { pageNumber: number; imageBuffer: Buffer }[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport } as never).promise;

    const buffer = canvas.toBuffer('image/png');
    pages.push({ pageNumber: i, imageBuffer: buffer });
  }

  return pages;
}

async function processUpload(
  uploadId: string,
  bankId: number,
  jobId: string
) {
  const uploadDir = path.join(UPLOAD_DIR, uploadId);
  if (!fs.existsSync(uploadDir)) {
    jobs.set(jobId, { ...createInitialJob(), status: 'error', phase: 'error', stepLabel: '上传失败', error: '上传文件不存在' });
    return;
  }

  const files = fs.readdirSync(uploadDir).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  );
  const pagesToProcess: { pageNumber: number; imageBase64: string }[] = [];
  let globalPageNum = 1;

  for (const file of files) {
    const filePath = path.join(uploadDir, file);
    const ext = path.extname(file).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    if (ext === '.pdf') {
      const pages = await convertPdfToImages(buffer);
      for (const p of pages) {
        pagesToProcess.push({
          pageNumber: globalPageNum++,
          imageBase64: p.imageBuffer.toString('base64'),
        });
      }
    } else if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext)) {
      pagesToProcess.push({
        pageNumber: globalPageNum++,
        imageBase64: buffer.toString('base64'),
      });
    } else if (ext === '.txt') {
      const text = buffer.toString('utf-8');
      pagesToProcess.push({
        pageNumber: globalPageNum++,
        imageBase64: `__TEXT__${text}`,
      });
    }
  }

  jobs.set(jobId, {
    ...createInitialJob(),
    totalPages: pagesToProcess.length,
    phaseTotal: Math.max(pagesToProcess.length, 1),
  });

  const results = await processInParallel(
    pagesToProcess,
    async (page) => {
      if (page.imageBase64.startsWith('__TEXT__')) {
        const text = page.imageBase64.slice(8);
        const extraction = await extractQuestionsFromText(text, page.pageNumber);
        return {
          pageNumber: page.pageNumber,
          data: extraction.data,
          rawContent: extraction.rawContent,
        };
      }
      const extraction = await extractQuestionsFromImage(page.imageBase64, page.pageNumber);
      return {
        pageNumber: page.pageNumber,
        data: extraction.data,
        rawContent: extraction.rawContent,
      };
    },
    10,
    (completed) => {
      const job = jobs.get(jobId);
      if (job) {
        job.processedPages = completed;
        job.phaseProcessed = completed;
      }
    }
  );

  const successfulResults = results
    .filter((r) => r.result)
    .map((r) => r.result as { pageNumber: number; data: ExtractionResult; rawContent: string });

  for (const result of results) {
    const pageNumber = (result.item as { pageNumber: number }).pageNumber;
    if (result.error) {
      console.error(`${EXTRACTION_LOG_PREFIX} page=${pageNumber} error=${String(result.error)}`);
      continue;
    }

    if (result.result) {
      const typedResult = result.result as { pageNumber: number; data: ExtractionResult; rawContent: string };
      console.log(`${EXTRACTION_LOG_PREFIX} page=${pageNumber} raw:\n${typedResult.rawContent}`);
      console.log(
        `${EXTRACTION_LOG_PREFIX} page=${pageNumber} parsed:\n${JSON.stringify(typedResult.data, null, 2)}`
      );
    }
  }

  const failedPages = results.filter((result) => result.error).length;
  const emptyPages = successfulResults.filter(
    (result) => (result.data.questions?.length || 0) === 0 && (result.data.answers_only?.length || 0) === 0
  ).length;
  const warnings: string[] = [];

  if (failedPages > 0) {
    warnings.push(`有 ${failedPages} 页识别失败，请检查原图或重新上传。`);
  }
  if (emptyPages > 0) {
    warnings.push(`有 ${emptyPages} 页未识别出题目或答案。`);
  }
  if (successfulResults.length === 0) {
    jobs.set(jobId, {
      ...createInitialJob(),
      status: 'error',
      phase: 'error',
      step: 1,
      stepLabel: '文本提取失败',
      processedPages: pagesToProcess.length,
      totalPages: pagesToProcess.length,
      questionsFound: 0,
      failedPages,
      emptyPages,
      warnings,
      pageLogs: results.map((result) => ({
        pageNumber: (result.item as { pageNumber: number }).pageNumber,
        error: result.error ? String(result.error) : undefined,
      })),
      error: '所有页面都未能识别成功',
    });
    return;
  }

  updateJobPhase(jobId, 'merging', 2, '合并中', 0, Math.max(successfulResults.length - 1, 1));
  const mergedQuestions = await mergeExtractionResults(
    successfulResults,
    (completed, total) => updateJobPhase(jobId, 'merging', 2, '合并中', completed, total)
  );

  const incompleteCount = mergedQuestions.filter((question) => !question.answer || !question.explanation).length;
  updateJobPhase(jobId, 'optimizing', 3, 'AI优化中', 0, Math.max(incompleteCount, 1));
  const merged = await repairIncompleteQuestions(
    mergedQuestions,
    (completed, total) => updateJobPhase(jobId, 'optimizing', 3, 'AI优化中', completed, total)
  );

  console.log(`${EXTRACTION_LOG_PREFIX} merged:\n${JSON.stringify(merged, null, 2)}`);

  if (merged.length === 0) {
    warnings.push('未识别到任何可导入的选择题。');
  }

  const insertStmt = db.prepare(
    'INSERT INTO question (bank_id, number, stem, options, answer, explanation, type, is_ai_generated, ai_flags, source_page, answer_source_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const maxNumber = db.prepare('SELECT MAX(number) as max FROM question WHERE bank_id = ?').get(bankId) as { max: number | null };
  let nextNumber = (maxNumber.max || 0) + 1;

  const insertMany = db.transaction((questions: typeof merged) => {
    for (const q of questions) {
      insertStmt.run(
        bankId,
        nextNumber++,
        q.stem,
        JSON.stringify(q.options),
        q.answer,
        q.explanation,
        q.type,
        q.is_ai_generated ? 1 : 0,
        JSON.stringify(q.ai_flags),
        q.source_page,
        q.answer_source_page ?? null
      );
    }
    db.prepare("UPDATE question_bank SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(bankId);
  });

  insertMany(merged);

  jobs.set(jobId, {
    status: 'completed',
    phase: 'completed',
    step: 3,
    totalSteps: 3,
    stepLabel: '处理完成',
    phaseProcessed: 1,
    phaseTotal: 1,
    processedPages: pagesToProcess.length,
    totalPages: pagesToProcess.length,
    questionsFound: merged.length,
    failedPages,
    emptyPages,
    warnings,
    pageLogs: results.map((result) => ({
      pageNumber: (result.item as { pageNumber: number }).pageNumber,
      rawContent: result.result ? (result.result as { rawContent: string }).rawContent : undefined,
      parsedData: result.result ? (result.result as { data: ExtractionResult }).data : undefined,
      error: result.error ? String(result.error) : undefined,
    })),
  });

  try {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  } catch {}
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uploadId, bankId } = body;

    if (!uploadId || !bankId) {
      return error('缺少上传ID或题库ID');
    }

    const bank = db.prepare('SELECT id FROM question_bank WHERE id = ?').get(bankId);
    if (!bank) return error('题库不存在', 404);

    const jobId = uuidv4();
    jobs.set(jobId, createInitialJob());

    processUpload(uploadId, bankId, jobId).catch((e) => {
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.phase = 'error';
        job.stepLabel = '处理失败';
        job.error = String(e);
      }
    });

    return success({ jobId });
  } catch (e) {
    return error(String(e), 500);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) return error('缺少任务ID');

  const job = jobs.get(jobId);
  if (!job) return error('任务不存在', 404);

  return success(job);
}
