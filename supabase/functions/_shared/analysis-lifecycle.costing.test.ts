import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  notifyLifecycleCosting,
  type LifecycleCostingObserver,
} from "./analysis-lifecycle.ts";

class Observer implements LifecycleCostingObserver {
  events: unknown[] = [];
  shouldThrow = false;

  observeMerit(
    featureRunId: string,
    transactionId: string,
    observation: "charged" | "refunded",
  ) {
    if (this.shouldThrow) throw new Error("telemetry unavailable");
    this.events.push({ featureRunId, transactionId, observation });
    return Promise.resolve();
  }

  terminalize(
    featureRunId: string,
    terminal: {
      status: "completed" | "failed" | "canceled";
      errorCode?: string;
      errorCategory?: string;
    },
  ) {
    if (this.shouldThrow) throw new Error("telemetry unavailable");
    this.events.push({ featureRunId, ...terminal });
    return Promise.resolve();
  }
}

Deno.test("lifecycle costing observes charge, refund, completion, and duplicate callbacks", async () => {
  const observer = new Observer();
  await notifyLifecycleCosting("run-1", observer, {
    type: "merit",
    transactionId: "tx-1",
    observation: "charged",
  });
  await notifyLifecycleCosting("run-1", observer, {
    type: "merit",
    transactionId: "tx-1",
    observation: "refunded",
  });
  await notifyLifecycleCosting("run-1", observer, {
    type: "terminal",
    status: "completed",
  });
  await notifyLifecycleCosting("run-1", observer, {
    type: "terminal",
    status: "completed",
  });
  assertEquals(observer.events.length, 4);
  assertEquals(observer.events[1], {
    featureRunId: "run-1",
    transactionId: "tx-1",
    observation: "refunded",
  });
});

Deno.test("lifecycle costing records canceled only from an explicit canceled event", async () => {
  const observer = new Observer();
  await notifyLifecycleCosting("run-1", observer, {
    type: "terminal",
    status: "failed",
    errorCode: "MODEL_TIMEOUT",
    errorCategory: "timeout",
  });
  await notifyLifecycleCosting("run-2", observer, {
    type: "terminal",
    status: "canceled",
    errorCode: "UNKNOWN_ANALYSIS_ERROR",
    errorCategory: "canceled",
  });
  assertEquals(observer.events, [
    {
      featureRunId: "run-1",
      status: "failed",
      errorCode: "MODEL_TIMEOUT",
      errorCategory: "timeout",
    },
    {
      featureRunId: "run-2",
      status: "canceled",
      errorCode: "UNKNOWN_ANALYSIS_ERROR",
      errorCategory: "canceled",
    },
  ]);
});

Deno.test("missing or throwing lifecycle telemetry never changes the caller result", async () => {
  await notifyLifecycleCosting(undefined, undefined, {
    type: "terminal",
    status: "failed",
  });
  const observer = new Observer();
  observer.shouldThrow = true;
  await notifyLifecycleCosting("run-1", observer, {
    type: "merit",
    transactionId: "tx-1",
    observation: "charged",
  });
  await notifyLifecycleCosting("run-1", observer, {
    type: "terminal",
    status: "failed",
  });
  assertEquals(observer.events, []);
});

Deno.test("lifecycle source keeps costing after canonical Merit and save evidence", async () => {
  const source = await Deno.readTextFile(
    new URL("./analysis-lifecycle.ts", import.meta.url),
  );
  const gateway = source.indexOf("const gated = await withMerits");
  const charge = source.indexOf("observation: 'charged'", gateway);
  const refund = source.indexOf("const refund = await refundMeritsForJob");
  const refundedObservation = source.indexOf("observation: 'refunded'", refund);
  const save = source.indexOf("await params.save(value)");
  const completed = source.lastIndexOf("status: 'completed'");
  assert(gateway !== -1 && charge > gateway);
  assert(refund !== -1 && refundedObservation > refund);
  assert(save !== -1 && completed > save);
  assert(source.includes("params.isConfirmedCancellation?.(err) === true"));
  assert(source.includes("confirmedCancellation ? 'canceled' : 'failed'"));
});
