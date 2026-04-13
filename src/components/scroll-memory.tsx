"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function ScrollMemory() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const key = `scroll:${pathname}?${searchParams?.toString() ?? ""}`;

  useEffect(() => {
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      const y = Number(raw);
      if (Number.isFinite(y) && y >= 0) window.scrollTo({ top: y });
    }

    let raf = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        window.sessionStorage.setItem(key, String(window.scrollY));
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [key]);

  return null;
}

