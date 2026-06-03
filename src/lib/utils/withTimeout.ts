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
