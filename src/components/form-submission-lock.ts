export type SubmissionLock = { current: boolean };
export type SubmitStartEvent = { preventDefault: () => void };

export function beginSubmission(lock: SubmissionLock, onStart?: () => void): boolean {
  if (lock.current) return false;
  lock.current = true;
  onStart?.();
  return true;
}

export function endSubmission(lock: SubmissionLock): void {
  lock.current = false;
}

export function handleFormSubmit(event: SubmitStartEvent, lock: SubmissionLock, onStart?: () => void): void {
  if (!beginSubmission(lock, onStart)) event.preventDefault();
}
