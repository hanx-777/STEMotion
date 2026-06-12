/**
 * Wraps a promise with a timeout. Rejects with an Error if the promise
 * does not settle within `timeoutMs` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(label ?? `Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function withAbortableTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label?: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      controller.abort(new Error(label ?? `Operation timed out after ${timeoutMs}ms`));
      reject(new Error(label ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation(controller.signal).then(
      (value) => {
        clearTimeout(timeout);
        parentSignal?.removeEventListener('abort', abortFromParent);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        parentSignal?.removeEventListener('abort', abortFromParent);
        reject(error);
      },
    );
  });
}
