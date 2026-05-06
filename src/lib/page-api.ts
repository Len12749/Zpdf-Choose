type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error?: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const MIN_REQUEST_INTERVAL_MS = 100;
const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 3;

let lastRequestStartedAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRequestSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, lastRequestStartedAt + MIN_REQUEST_INTERVAL_MS - now);

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastRequestStartedAt = Date.now();
}

export async function fetchPageData<T>(input: string, init?: RequestInit): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await waitForRequestSlot();

    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json() as ApiResponse<T>;
      if (!payload.success) {
        throw new Error(payload.error || 'API request failed');
      }

      return payload.data;
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  return null;
}
