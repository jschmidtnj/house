import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { UI_CONFIG } from "../config";

interface TipCoords {
  left: number;
  top: number;
  below: boolean;
}

function computeCoords(el: HTMLElement, tipWidth: number, align: "left" | "right" | "center"): TipCoords {
  const rect = el.getBoundingClientRect();
  let rawLeft = rect.left + rect.width / 2 - tipWidth / 2;
  if (align === "left") rawLeft = rect.left;
  if (align === "right") rawLeft = rect.right - tipWidth;

  const clampedLeft = Math.max(12, Math.min(window.innerWidth - tipWidth - 12, rawLeft));
  const below = rect.top < 84;
  return {
    left: clampedLeft,
    top: below ? rect.bottom + 6 : rect.top - 6,
    below,
  };
}

interface InfoTipProps {
  text: string;
  align?: "left" | "right" | "center";
}

export function InfoTip({ text, align = "center" }: InfoTipProps) {
  const [coords, setCoords] = useState<TipCoords | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);

  const openTip = () => {
    if (!ref.current) return;
    setCoords(computeCoords(ref.current, 240, align));
  };

  const closeTip = () => setCoords(null);

  useEffect(() => {
    if (!coords) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setCoords(null);
      }
    };
    const onScroll = () => setCoords(null);
    window.addEventListener("mousedown", onOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onOutside);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [coords]);

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={openTip}
      onMouseLeave={closeTip}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (coords) closeTip();
          else openTip();
        }}
        className="ml-1 inline-flex text-zinc-500 transition hover:text-zinc-200 focus:outline-none"
        aria-label="More info"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              transform: coords.below ? "none" : "translateY(-100%)",
            }}
            className="pointer-events-none fixed z-[2500] w-60 rounded-lg border border-zinc-700 bg-zinc-900/95 px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-zinc-200 shadow-2xl backdrop-blur"
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

interface HoverTipProps {
  text: string;
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function HoverTip({
  text,
  children,
  delayMs = UI_CONFIG.hoverTipDelayMs,
  className,
  style,
}: HoverTipProps) {
  const [coords, setCoords] = useState<TipCoords | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  useEffect(() => {
    if (!coords) return;
    const hide = () => setCoords(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [coords]);

  const show = () => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (!triggerRef.current) return;
      setCoords(computeCoords(triggerRef.current, 236, "center"));
    }, delayMs);
  };

  const hide = () => {
    clearTimer();
    setCoords(null);
  };

  return (
    <span
      ref={triggerRef}
      style={style}
      className={className ?? "inline-flex"}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              transform: coords.below ? "none" : "translateY(-100%)",
            }}
            className="pointer-events-none fixed z-[2500] w-[236px] rounded-lg border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-zinc-200 shadow-2xl backdrop-blur"
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
