export type FocusDialogKeyEvent = {
  key: string;
  preventDefault: () => void;
};

export function requestFocusDialogClose(
  closeDisabledRef: { current: boolean },
  onClose: () => void,
  force = false,
): boolean {
  if (!force && closeDisabledRef.current) return false;
  onClose();
  return true;
}

export function handleFocusDialogEscape(
  event: FocusDialogKeyEvent,
  closeDisabledRef: { current: boolean },
  onClose: () => void,
): boolean {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  requestFocusDialogClose(closeDisabledRef, onClose);
  return true;
}
