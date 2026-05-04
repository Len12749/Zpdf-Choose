'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Upload, FileText, ImageIcon, X, ChevronLeft, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface PreparedUploadItem {
  id: string;
  file: File;
  preview?: string;
  sourceName: string;
  displayName: string;
  sizeLabel: string;
  kind: 'image' | 'text';
}

interface ExtractionResultState {
  questionsAdded: number;
  warnings: string[];
}

interface ExtractionProgressState {
  step: number;
  totalSteps: number;
  stepLabel: string;
  processed: number;
  total: number;
  warnings: string[];
}

interface DragState {
  id: string;
  startY: number;
  currentY: number;
  targetId: string;
  baseOrder: string[];
  positions: Record<string, { top: number; height: number }>;
}

let preparedItemCounter = 0;
let pdfWorkerConfigured = false;

export default function CreateQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const bankId = params.id as string;
  const { toast } = useToast();

  const [files, setFiles] = useState<PreparedUploadItem[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgressState>({
    step: 1,
    totalSteps: 3,
    stepLabel: '文本提取中',
    processed: 0,
    total: 1,
    warnings: [],
  });
  const [result, setResult] = useState<ExtractionResultState | null>(null);
  const [zoomItem, setZoomItem] = useState<PreparedUploadItem | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    return () => {
      files.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    };
  }, [files]);

  const handleFiles = async (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const valid = arr.filter((file) => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['pdf', 'txt', 'md', 'jpg', 'jpeg', 'png', 'bmp', 'webp'].includes(ext || '');
    });

    if (valid.length === 0) {
      toast('没有可处理的文件', 'error');
      return;
    }

    setPreparing(true);
    const prepared: PreparedUploadItem[] = [];
    const failedFiles: string[] = [];

    for (const file of valid) {
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          prepared.push(...await convertPdfToPreparedItems(file));
        } else {
          prepared.push(await createPreparedItemFromFile(file));
        }
      } catch (error) {
        failedFiles.push(`${file.name}${error instanceof Error ? `（${error.message}）` : ''}`);
      }
    }

    try {
      setFiles((prev) => [...prev, ...prepared]);
      if (prepared.length > 0) {
        toast(`已加入 ${prepared.length} 个文件`, 'success');
      }
      if (failedFiles.length > 0) {
        toast(`以下文件预处理失败：${failedFiles.join('、')}`, 'error');
      }
      if (prepared.length === 0 && failedFiles.length > 0) {
        toast('没有可用文件被加入列表', 'error');
      }
    } catch {
      toast('文件加入列表失败，请重试', 'error');
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextY = event.clientY;
      setDragState((current) => {
        if (!current) return current;
        const nextTargetId = findTargetId(current, nextY);
        return {
          ...current,
          currentY: nextY,
          targetId: nextTargetId,
        };
      });
    };

    const handlePointerUp = () => {
      const current = dragState;
      if (current && current.id !== current.targetId) {
        const reorderedIds = reorderIds(current.baseOrder, current.id, current.targetId);
        setFiles((prev) => reorderFileItems(prev, current.id, current.targetId));
        setDragState({
          ...current,
          baseOrder: reorderedIds,
          startY: current.currentY,
          currentY: current.currentY,
          id: current.targetId,
          targetId: current.targetId,
        });
        requestAnimationFrame(() => requestAnimationFrame(() => setDragState(null)));
        return;
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState]);

  const previewOrder = useMemo(() => {
    if (!dragState) return files.map((item) => item.id);
    return reorderIds(dragState.baseOrder, dragState.id, dragState.targetId);
  }, [dragState, files]);

  const handleUploadAndExtract = async () => {
    if (files.length === 0) {
      toast('请先上传文件', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((item) => formData.append('files', item.file, item.file.name));

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        toast(uploadData.error || '上传失败', 'error');
        return;
      }

      const { uploadId } = uploadData.data;
      setExtracting(true);
      setUploading(false);
      setProgress({
        step: 1,
        totalSteps: 3,
        stepLabel: '文本提取中',
        processed: 0,
        total: 1,
        warnings: [],
      });

      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, bankId: Number(bankId) }),
      });
      const extractData = await extractRes.json();
      if (!extractData.success) {
        toast(extractData.error || '提取失败', 'error');
        return;
      }

      const { jobId } = extractData.data;

      const poll = setInterval(async () => {
        const statusRes = await fetch(`/api/extract?jobId=${jobId}`);
        const statusData = await statusRes.json();
        if (!statusData.success) return;

        const job = statusData.data;
        setProgress({
          step: job.step || 1,
          totalSteps: job.totalSteps || 3,
          stepLabel: job.stepLabel || '处理中',
          processed: job.phaseProcessed || 0,
          total: job.phaseTotal || 1,
          warnings: job.warnings || [],
        });

        if (job.status === 'completed') {
          clearInterval(poll);
          setExtracting(false);
          setResult({
            questionsAdded: job.questionsFound,
            warnings: job.warnings || [],
          });
          if (job.questionsFound > 0) {
            toast(`成功提取 ${job.questionsFound} 道题`, 'success');
          } else {
            toast('未识别到可导入的选择题', 'info');
          }
        } else if (job.status === 'error') {
          clearInterval(poll);
          setExtracting(false);
          toast(job.error || '提取过程中出错', 'error');
        }
      }, 2000);
    } catch {
      toast('网络错误', 'error');
      setUploading(false);
      setExtracting(false);
    }
  };

  const getFileIcon = (item: PreparedUploadItem) => {
    if (item.kind === 'text') return <FileText className="w-5 h-5 text-accent" />;
    return <ImageIcon className="w-5 h-5 text-success" />;
  };

  const draggedOffsetY = dragState ? dragState.currentY - dragState.startY : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link
        href={`/question-bank/${bankId}`}
        className="inline-flex items-center gap-1 text-sm text-content-secondary hover:text-accent mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> 返回题库
      </Link>

      <h1 className="text-2xl font-bold text-content-primary mb-2">添加题目</h1>
      <p className="text-content-secondary mb-8">上传 PDF、文本或图片。当前列表顺序就是 AI 的识别顺序，答案匹配也按这个顺序进行。</p>

      {result ? (
        <div className="text-center py-16">
          <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-content-primary mb-2">提取完成</h2>
          <p className="text-content-secondary mb-4">成功提取 {result.questionsAdded} 道选择题</p>
          {result.warnings.length > 0 && (
            <div className="max-w-2xl mx-auto text-left bg-warning/10 border border-warning/20 rounded-2xl p-4 mb-8">
              <p className="text-sm font-medium text-content-primary mb-2">识别提醒</p>
              <div className="space-y-1 text-sm text-content-secondary">
                {result.warnings.map((warning) => <p key={warning}>- {warning}</p>)}
              </div>
            </div>
          )}
          <div className="flex justify-center gap-4">
            <Button variant="secondary" onClick={() => { setResult(null); setFiles([]); }}>
              继续添加
            </Button>
            <Button onClick={() => router.push(`/question-bank/${bankId}`)}>
              查看题库
            </Button>
          </div>
        </div>
      ) : extracting ? (
        <div className="text-center py-16">
          <Loader2 className="w-16 h-16 text-accent mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-semibold text-content-primary mb-2">
            {progress.step} / {progress.totalSteps} {progress.stepLabel}
          </h2>
          <p className="text-content-secondary mb-4">
            AI 正在处理中...
          </p>
          <div className="max-w-xs mx-auto bg-surface-tertiary rounded-full h-2 overflow-hidden mb-4">
            <div
              className="bg-accent h-full rounded-full transition-all duration-500"
              style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
            />
          </div>
          {progress.warnings.length > 0 && (
            <div className="max-w-xl mx-auto text-left bg-warning/10 border border-warning/20 rounded-2xl p-4">
              <div className="space-y-1 text-sm text-content-secondary">
                {progress.warnings.map((warning) => <p key={warning}>- {warning}</p>)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className={cn(
              'border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer',
              'border-border hover:border-accent/50 hover:bg-accent/5'
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="w-12 h-12 text-content-secondary mx-auto mb-4" />
            <p className="text-content-primary font-medium mb-1">点击或拖拽文件到此处</p>
            <p className="text-sm text-content-secondary">PDF 会自动拆成页面图片，也支持 TXT、MD、图片上传</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.bmp,.webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  void handleFiles(e.target.files);
                }
              }}
            />
          </div>

          {preparing && (
            <div className="mt-4 flex items-center gap-3 text-sm text-content-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>正在解析 PDF 页面并生成可排序预览...</span>
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-medium text-content-primary">当前识别顺序</h3>
                  <p className="text-sm text-content-secondary">上下调整顺序后，AI 会按这里的先后识别题目与答案。</p>
                </div>
                <Button onClick={handleUploadAndExtract} loading={uploading} disabled={preparing}>
                  开始提取
                </Button>
              </div>

              <div className="space-y-3">
                {files.map((item, index) => (
                  <div
                    key={item.id}
                    ref={(node) => {
                      itemRefs.current[item.id] = node;
                    }}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('button')) {
                        return;
                      }
                      const positions = measureItemPositions(files, itemRefs.current);
                      if (!positions[item.id]) {
                        return;
                      }
                      event.preventDefault();
                      setDragState({
                        id: item.id,
                        startY: event.clientY,
                        currentY: event.clientY,
                        targetId: item.id,
                        baseOrder: files.map((file) => file.id),
                        positions,
                      });
                    }}
                    className={cn(
                      'bg-surface-secondary border rounded-2xl p-4 transition-transform duration-200 ease-out hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 touch-none select-none',
                      dragState?.id === item.id ? 'border-accent shadow-2xl shadow-accent/15 z-20 relative' : 'border-border'
                    )}
                    style={getItemTransformStyle(item.id, files, dragState, previewOrder, draggedOffsetY)}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        type="button"
                        onClick={() => item.preview && setZoomItem(item)}
                        className="w-24 h-24 rounded-xl overflow-hidden bg-surface-tertiary shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        {item.preview ? (
                          <div className="relative w-full h-full">
                            <Image src={item.preview} alt={item.displayName} fill unoptimized className="object-cover" />
                          </div>
                        ) : (
                          getFileIcon(item)
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                            顺序 {index + 1}
                          </span>
                          <span className="text-xs text-content-secondary">来源：{item.sourceName}</span>
                        </div>
                        <p className="text-content-primary font-medium break-all">{item.displayName}</p>
                        <p className="text-xs text-content-secondary mt-1">{item.sizeLabel}</p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-xs text-content-secondary">拖动排序</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="p-2 rounded-lg text-content-secondary hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                          title="删除"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={!!zoomItem} onClose={() => setZoomItem(null)} title={zoomItem?.displayName || '预览'}>
        {zoomItem?.preview && (
          <div className="space-y-4">
            <div className="relative w-full aspect-[3/4] rounded-2xl border border-border overflow-hidden">
              <Image src={zoomItem.preview} alt={zoomItem.displayName} fill unoptimized className="object-contain bg-surface-tertiary" />
            </div>
            <p className="text-sm text-content-secondary">{zoomItem.sourceName}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

async function createPreparedItemFromFile(file: File): Promise<PreparedUploadItem> {
  const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|bmp|webp)$/i.test(file.name);
  let preview: string | undefined;

  if (isImage) {
    try {
      preview = URL.createObjectURL(file);
    } catch {
      preview = undefined;
    }
  }

  return {
    id: createPreparedItemId(),
    file,
    preview,
    sourceName: file.name,
    displayName: file.name,
    sizeLabel: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    kind: isImage ? 'image' : 'text',
  };
}

async function convertPdfToPreparedItems(file: File): Promise<PreparedUploadItem[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  configurePdfWorker(pdfjsLib);
  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
  } as never);
  const doc = await loadingTask.promise;

  const baseName = file.name.replace(/\.pdf$/i, '');
  const items: PreparedUploadItem[] = [];

  for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex++) {
    const page = await doc.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('无法创建 PDF 预览画布');
    }

    await page.render({
      canvasContext: context,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    } as never).promise;

    const blob = await canvasToBlob(canvas);
    const pageFile = new File([blob], `${baseName}-第${pageIndex}页.png`, { type: 'image/png' });
    let preview: string | undefined;
    try {
      preview = URL.createObjectURL(blob);
    } catch {
      preview = undefined;
    }
    items.push({
      id: createPreparedItemId(),
      file: pageFile,
      preview,
      sourceName: file.name,
      displayName: `${file.name} · 第 ${pageIndex} 页`,
      sizeLabel: `${(pageFile.size / 1024 / 1024).toFixed(1)} MB`,
      kind: 'image',
    });
  }

  return items;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法生成预览图片'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function createPreparedItemId(): string {
  preparedItemCounter += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prepared-${crypto.randomUUID()}`;
  }
  return `prepared-${Date.now()}-${preparedItemCounter}`;
}

function measureItemPositions(
  files: PreparedUploadItem[],
  refs: Record<string, HTMLDivElement | null>
): Record<string, { top: number; height: number }> {
  const positions: Record<string, { top: number; height: number }> = {};

  for (const item of files) {
    const node = refs[item.id];
    if (!node) continue;
    positions[item.id] = {
      top: node.offsetTop,
      height: node.offsetHeight,
    };
  }

  return positions;
}

function findTargetId(dragState: DragState, pointerY: number): string {
  const dragged = dragState.positions[dragState.id];
  if (!dragged) return dragState.targetId;

  const draggedCenter = dragged.top + (pointerY - dragState.startY) + dragged.height / 2;
  const candidates = dragState.baseOrder.filter((id) => id !== dragState.id);

  for (const candidateId of candidates) {
    const position = dragState.positions[candidateId];
    if (!position) continue;
    const center = position.top + position.height / 2;
    if (draggedCenter < center) {
      return candidateId;
    }
  }

  return dragState.baseOrder[dragState.baseOrder.length - 1];
}

function reorderIds(baseOrder: string[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId) return baseOrder;
  const sourceIndex = baseOrder.indexOf(sourceId);
  const targetIndex = baseOrder.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return baseOrder;

  const next = [...baseOrder];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

function getItemTransformStyle(
  itemId: string,
  files: PreparedUploadItem[],
  dragState: DragState | null,
  previewOrder: string[],
  draggedOffsetY: number
): CSSProperties {
  if (!dragState) {
    return {};
  }

  if (itemId === dragState.id) {
    return {
      transform: `translateY(${draggedOffsetY}px)`,
      transitionDuration: '0ms',
    };
  }

  const originalIndex = files.findIndex((item) => item.id === itemId);
  const previewIndex = previewOrder.indexOf(itemId);
  if (originalIndex < 0 || previewIndex < 0) {
    return {};
  }

  const originalId = files[originalIndex]?.id;
  const previewSlotId = dragState.baseOrder[previewIndex];
  const originalTop = originalId ? dragState.positions[originalId]?.top : undefined;
  const previewTop = previewSlotId ? dragState.positions[previewSlotId]?.top : undefined;

  if (originalTop === undefined || previewTop === undefined) {
    return {};
  }

  return {
    transform: `translateY(${previewTop - originalTop}px)`,
  };
}

function reorderFileItems(files: PreparedUploadItem[], sourceId: string, targetId: string): PreparedUploadItem[] {
  if (sourceId === targetId) return files;
  const sourceIndex = files.findIndex((item) => item.id === sourceId);
  const targetIndex = files.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return files;

  const next = [...files];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

function configurePdfWorker(pdfjsLib: {
  GlobalWorkerOptions?: { workerSrc?: string };
}): void {
  if (pdfWorkerConfigured) return;
  if (!pdfjsLib.GlobalWorkerOptions) return;

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Keep the explicit disableWorker fallback in getDocument.
  }

  pdfWorkerConfigured = true;
}
