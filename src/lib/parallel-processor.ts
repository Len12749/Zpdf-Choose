export interface ProcessResult<T, R> {
  item: T;
  result?: R;
  error?: Error;
}

export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 10,
  onProgress?: (completed: number, total: number) => void
): Promise<ProcessResult<T, R>[]> {
  const results: ProcessResult<T, R>[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        const result = await processor(items[index]);
        results[index] = { item: items[index], result };
      } catch (e) {
        results[index] = { item: items[index], error: e instanceof Error ? e : new Error(String(e)) };
      }
      completed++;
      onProgress?.(completed, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
