import { LoaderCircle, Play } from "lucide-react";
import laptop from "../assets/laptop.webp";
import { Button } from "./ui/button";
import { ICON_STROKE } from "../pages/nav";

export function ScanHero({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  return (
    <section
      aria-labelledby="scan-title"
      className="relative mt-4 flex h-[7.25rem] items-center overflow-hidden rounded-[20px] border border-[#e4e3f6] px-6"
      style={{ background: "linear-gradient(100deg, #ebeafb 0%, #f1f0fc 55%, #e9e8fa 100%)" }}
    >
      {/* Soft wave, decorative only. No z-index so the image blend still sees the gradient. */}
      <svg
        aria-hidden
        viewBox="0 0 600 220"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[55%]"
      >
        <path d="M0 220 C 180 200, 300 120, 420 70 S 560 10, 600 0 L600 220 Z" fill="#ffffff" opacity="0.35" />
        <path d="M120 220 C 300 190, 400 140, 500 90 S 580 40, 600 30 L600 220 Z" fill="#ffffff" opacity="0.3" />
      </svg>

      <img
        src={laptop}
        alt=""
        className="h-24 w-auto shrink-0 select-none"
        style={{ mixBlendMode: "multiply" }}
        draggable={false}
      />
      <div aria-hidden className="mx-6 h-16 w-px shrink-0 bg-[#d6d5ee]" />
      <div className="relative min-w-0 flex-1">
        <h2 id="scan-title" className="text-[1.375rem] leading-tight font-semibold tracking-tight">
          Scan your PC
        </h2>
        <p className="mt-1 truncate text-[0.875rem] text-muted">
          Read stability, storage, memory and startup data in one pass.
        </p>
      </div>
      <div className="relative ml-6 shrink-0">
        <Button size="lg" onClick={onScan} disabled={scanning}>
          {scanning ? (
            <LoaderCircle size={18} strokeWidth={ICON_STROKE} aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Play size={18} strokeWidth={ICON_STROKE} aria-hidden />
          )}
          <span aria-live="polite">{scanning ? "Scanning…" : "Scan Now"}</span>
        </Button>
      </div>
    </section>
  );
}
