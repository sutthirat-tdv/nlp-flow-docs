/** Shared routing helpers for HTTP endpoints vs CRON batch jobs. */

export function isBatchJob(method: string): boolean {
  return method === "CRON";
}

export function endpointHref(entry: {
  id: string;
  method: string;
}): string {
  return isBatchJob(entry.method)
    ? `/jobs/${encodeURIComponent(entry.id)}`
    : `/endpoints/${encodeURIComponent(entry.id)}`;
}
