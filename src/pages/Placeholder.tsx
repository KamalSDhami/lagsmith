import { Card } from "../components/ui/card";

export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight">{title}</h1>
      <Card className="mt-6 p-6">
        <p className="text-[0.9375rem] text-muted">Coming in a later build.</p>
      </Card>
    </div>
  );
}
