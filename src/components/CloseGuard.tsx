import { useEffect, useState } from "react";
import { closeApp, onCloseBlocked } from "../lib/api";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";

/** Rust blocks closing the window while an admin task runs; this asks what to do. */
export function CloseGuard() {
  const [task, setTask] = useState<string | null>(null);
  useEffect(() => {
    const off = onCloseBlocked(setTask);
    return () => void off.then((f) => f());
  }, []);
  return (
    <Dialog open={task !== null} onClose={() => setTask(null)} title="Repair still running" className="w-[28rem]">
      <div className="p-6">
        <h2 className="text-[1.125rem] font-semibold">{task} is still running</h2>
        <p className="mt-1 text-[0.875rem] text-muted">
          If you close Lagsmith now, the repair keeps running in the background and finishes on its own. Lagsmith can't show its progress
          until you open it again, and the result appears on System Repair then.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => void closeApp()}>
            Close anyway
          </Button>
          <Button onClick={() => setTask(null)}>Keep Lagsmith open</Button>
        </div>
      </div>
    </Dialog>
  );
}
