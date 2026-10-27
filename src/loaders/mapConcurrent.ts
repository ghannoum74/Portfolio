/** Bounded work with stable result ordering; stop scheduling after a failure. */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number,
  task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0, failed = false;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1)) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await task(items[index], index); }
      catch (error) { failed = true; throw error; }
    }
  }));
  const failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
  if (failure) throw failure.reason;
  return results;
}
