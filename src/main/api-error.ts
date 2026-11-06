import type { SnapshotError } from '../shared/types';

function errorCode(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = candidate?.cause?.code ?? candidate?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Classify Node fetch failures without treating every failure as "service offline".
 * A timeout means the service accepted the request but did not finish in time;
 * an unreachable error means the TCP connection itself failed.
 */
export function classifyFetchError(error: unknown): SnapshotError {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const message = typeof candidate?.message === 'string' ? candidate.message : String(error);

  if (name === 'TimeoutError' || name === 'AbortError' || /timed? ?out|aborted due to timeout/i.test(message)) {
    return { kind: 'timeout', message: '硬件服务响应超时' };
  }

  if (error instanceof SyntaxError) {
    return { kind: 'parse', message: '硬件服务返回了无法解析的数据' };
  }

  const code = errorCode(error);
  if (code) {
    return { kind: 'unreachable', message: `无法连接硬件服务（${code}）` };
  }

  return { kind: 'unreachable', message: message || '无法连接硬件服务' };
}
