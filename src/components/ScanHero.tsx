import { LoaderCircle, Play } from "lucide-react";
import laptop from "../assets/laptop.webp";
import { Button } from "./ui/button";
import { ICON_STROKE } from "../pages/nav";
import { formatAgo } from "../lib/format";

export function ScanHero({ onScan, scanning, finishedAt }: { onScan: () => void; scanning: boolean; finishedAt: number | null }) {
  return (
    <section
      aria-labelledby="scan-title"
      className="relative flex h-[7.25rem] items-center overflow-hidden rounded-[20px] border border-[#e4e3f6] bg-[#eeedfb] px-6"
    >
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
        <p className="mt-1 text-[0.875rem] leading-snug text-muted">
          Read stability, storage, memory and startup data in one pass.
          {finishedAt ? ` Last scanned ${formatAgo(finishedAt)}.` : ""}
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
