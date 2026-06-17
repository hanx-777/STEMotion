export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_STEMOTION_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_STEMOTION_API_BASE_URL.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:3101';
}
