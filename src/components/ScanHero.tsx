import { Clock, LoaderCircle, Play } from "lucide-react";
import laptop from "../assets/laptop.webp";
import { Button } from "./ui/button";
import { ICON_STROKE } from "../pages/nav";

export function ScanHero({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  return (
    <section
      aria-labelledby="scan-title"
      className="relative mt-6 flex items-center overflow-hidden rounded-[20px] border border-[#e4e3f6] px-8 py-5"
      style={{ background: "linear-gradient(100deg, #ebeafb 0%, #f1f0fc 55%, #e9e8fa 100%)" }}
    >
      {/* Soft wave, decorative only. No z-index so the image blend still sees the gradient. */}
      <svg aria-hidden viewBox="0 0 600 220" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 right-0 h-full w-[55%]">
        <path d="M0 220 C 180 200, 300 120, 420 70 S 560 10, 600 0 L600 220 Z" fill="#ffffff" opacity="0.35" />
        <path d="M120 220 C 300 190, 400 140, 500 90 S 580 40, 600 30 L600 220 Z" fill="#ffffff" opacity="0.3" />
      </svg>

      <img
        src={laptop}
        alt=""
        className="w-[210px] shrink-0 select-none"
        style={{ mixBlendMode: "multiply" }}
        draggable={false}
      />
      <div aria-hidden className="mx-8 h-[124px] w-px shrink-0 bg-[#d6d5ee]" />
      <div className="relative min-w-0">
        <div className="text-[12px] font-semibold tracking-[0.08em] text-muted">SYSTEM SCAN</div>
        <h2 id="scan-title" className="mt-1 text-[26px] leading-tight font-semibold tracking-tight">
          Scan your PC
        </h2>
        <p className="mt-1.5 text-[15px] text-muted">Find issues, free up space, and get your system ready for gaming.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onScan} disabled={scanning} aria-live="polite">
            {scanning ? (
              <LoaderCircle size={18} strokeWidth={ICON_STROKE} className="motion-safe:animate-spin" />
            ) : (
              <Play size={18} strokeWidth={ICON_STROKE} />
            )}
            {scanning ? "Scanning…" : "Scan Now"}
          </Button>
          <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/60 px-4 text-[14px] text-muted">
            <Clock size={17} strokeWidth={ICON_STROKE} />~ 10 - 40 seconds
          </span>
        </div>
      </div>
    </section>
  );
}
