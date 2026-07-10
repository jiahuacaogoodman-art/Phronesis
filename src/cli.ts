import { RunManager } from "./run-manager.ts";

function readGoal(argv: string[]): string | undefined {
  const goalFlagIndex = argv.findIndex((arg) => arg === "--goal" || arg === "-g");
  if (goalFlagIndex >= 0) {
    return argv[goalFlagIndex + 1];
  }

  const inlineGoal = argv.find((arg) => arg.startsWith("--goal="));
  if (inlineGoal) {
    return inlineGoal.slice("--goal=".length);
  }

  return undefined;
}

async function main(): Promise<void> {
  const goal = readGoal(process.argv.slice(2));
  if (!goal) {
    console.error('Usage: pnpm think:run --goal "做一个签到系统"');
    process.exitCode = 1;
    return;
  }

  const manager = new RunManager();
  const result = await manager.run(goal);

  console.log("Deliberative Thinking Agent Core v0.4");
  console.log(`Run ID: ${result.runId}`);
  console.log(`Run directory: ${result.runDir}`);
  console.log(`Detected domain: ${result.artifacts.domainAnalysis.domainId} (${result.artifacts.domainAnalysis.confidence})`);
  console.log(`Selected route: ${result.artifacts.selectedRoute.selectedStrategyId} - ${result.artifacts.selectedRoute.selectedTitle}`);
  console.log("Artifacts written:");
  console.log("  goal.json");
  console.log("  domain-analysis.json");
  console.log("  product-intent.json");
  console.log("  evidence-ledger.json");
  console.log("  reconstructed-intent.json");
  console.log("  product-expansion.json");
  console.log("  research-plan.json");
  console.log("  evidence-map.json");
  console.log("  strategy-candidates.json");
  console.log("  anti-simplification-report.json");
  console.log("  critic-council-report.json");
  console.log("  selected-route.json");
  console.log("  decision-ledger.json");
  console.log("  architecture-plan.md");
  console.log("  execution-task-graph.json");
  console.log("  final-thinking-report.md");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Thinking run failed: ${message}`);
  process.exitCode = 1;
});