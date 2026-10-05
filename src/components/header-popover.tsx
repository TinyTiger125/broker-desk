"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const CLOSE_DELAY_MS = 200;

type HeaderPopoverProps = {
  title: string;
  panelClassName: string;
  children: ReactNode;
  trigger: ReactNode;
};

export function HeaderPopover({ title, panelClassName, children, trigger }: HeaderPopoverProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const pointerInsideRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const close = (returnFocus = false) => {
    clearCloseTimer();
    setOpen(false);
    if (returnFocus) {
      summaryRef.current?.focus();
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (!pointerInsideRef.current && !menuRef.current?.matches(":hover") && !panelRef.current?.contains(document.activeElement)) {
        setOpen(false);
      }
    }, CLOSE_DELAY_MS);
  };

  const enterRegion = () => {
    pointerInsideRef.current = true;
    clearCloseTimer();
  };

  const leaveRegion = () => {
    pointerInsideRef.current = false;
    scheduleClose();
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      pointerInsideRef.current = inside;
      if (inside) clearCloseTimer();
      else if (open) scheduleClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        close(true);
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      clearCloseTimer();
    };
  });

  return (
    <details
      ref={menuRef}
      className="app-header-menu relative"
      open={open || undefined}
      onPointerEnter={enterRegion}
      onPointerLeave={leaveRegion}
      onFocusCapture={clearCloseTimer}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          scheduleClose();
        }
      }}
    >
      <summary
        ref={summaryRef}
        className="app-header-menu-trigger"
        title={title}
        onClick={(event) => {
          event.preventDefault();
          clearCloseTimer();
          setOpen((currentOpen) => !currentOpen);
        }}
        onMouseEnter={enterRegion}
        onMouseLeave={leaveRegion}
      >
        {trigger}
      </summary>
      <div ref={panelRef} className={panelClassName} onMouseEnter={enterRegion} onMouseLeave={leaveRegion} onPointerEnter={enterRegion} onPointerLeave={leaveRegion}>{children}</div>
    </details>
  );
}
