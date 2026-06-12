type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BACKEND_BASE_URL = 'http://127.0.0.1:3101';
const BACKEND_UNAVAILABLE_MESSAGE = 'STEMotion backend is not running. Start it with `npm run dev:api`.';

export function getBackendBaseUrl(): string {
  return (process.env.STEMOTION_API_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, '');
}

export async function proxyBackendJson(
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  try {
    const upstream = await fetchImpl(toBackendUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return cloneBackendResponse(upstream);
  } catch {
    return Response.json({ error: BACKEND_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
}

export async function proxyBackendSse(
  path: string,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  try {
    const upstream = await fetchImpl(toBackendUrl(path), {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });
    return new Response(createTolerantSseStream(upstream.body), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream; charset=utf-8',
        'Cache-Control': upstream.headers.get('Cache-Control') ?? 'no-cache, no-transform',
        Connection: upstream.headers.get('Connection') ?? 'keep-alive',
      },
    });
  } catch {
    return Response.json({ error: BACKEND_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
}

function toBackendUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalized}`;
}

function cloneBackendResponse(upstream: Response): Response {
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
    },
  });
}

function createTolerantSseStream(
  body: ReadableStream<Uint8Array> | null,
): ReadableStream<Uint8Array> | null {
  if (!body) return null;

  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          closeStream(controller);
          return;
        }
        if (value) controller.enqueue(value);
      } catch (error) {
        if (isExpectedSseTermination(error)) {
          closeStream(controller);
          return;
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch (error) {
        if (!isExpectedSseTermination(error)) throw error;
      }
    },
  });
}

function closeStream(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close();
  } catch {
    // The downstream connection may already be cancelled while an upstream read is settling.
  }
}

function isExpectedSseTermination(error: unknown): boolean {
  for (const item of errorChain(error)) {
    const message = item instanceof Error ? item.message : String(item);
    if (/terminated|aborted|cancelled|canceled|other side closed|socket closed/i.test(message)) {
      return true;
    }

    const code = getErrorCode(item);
    if (code && /^(UND_ERR_SOCKET|ECONNRESET|EPIPE|ERR_STREAM_PREMATURE_CLOSE)$/i.test(code)) {
      return true;
    }
  }

  return false;
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; current !== undefined && depth < 5; depth += 1) {
    chain.push(current);
    current = getErrorCause(current);
  }
  return chain;
}

function getErrorCause(error: unknown): unknown {
  if (!error || typeof error !== 'object' || !('cause' in error)) return undefined;
  return (error as { cause?: unknown }).cause;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
