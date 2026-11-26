import { Card } from "../components/ui/card";

export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
      <Card className="mt-6 p-6">
        <p className="text-[15px] text-muted">Coming in a later build.</p>
      </Card>
    </div>
  );
}
