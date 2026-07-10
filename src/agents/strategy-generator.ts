import type {
  DomainAnalysis,
  ProductExpansion,
  EvidenceLedger,
  ProductIntentModel,
  ReconstructedIntent,
  StrategyCandidate,
  SynthesizedCapability,
} from "../types/artifacts.ts";
import { synthesizeRoutes } from "../lib/route-synthesis.ts";

export function generateStrategies(
  intent: ReconstructedIntent,
  expansion: ProductExpansion,
  domainAnalysis: DomainAnalysis,
  productIntent?: ProductIntentModel,
  synthesizedCapabilities?: SynthesizedCapability[],
  evidenceLedger?: EvidenceLedger,
): StrategyCandidate[] {
  if (productIntent && synthesizedCapabilities) {
    return synthesizeRoutes(productIntent, domainAnalysis, synthesizedCapabilities, evidenceLedger);
  }

  const fallbackCapabilities = expansion.coreCapabilities.map((capability) => ({
    id: capability.id,
    name: capability.name,
    priority: capability.priority,
    whyNeeded: capability.whyItMatters,
    triggeredBy: capability.triggeredBy ?? ["fallback:product-expansion"],
    userValue: capability.userValue ?? capability.acceptanceSignal,
    systemCapability: capability.systemCapability ?? capability.acceptanceSignal,
    riskIfMissing: capability.riskIfMissing ?? "Capability was not modeled with v0.3 synthesis.",
  }));

  const fallbackIntent = {
    rawGoal: intent.rawGoal,
    normalizedGoal: intent.normalizedGoal,
    domainId: domainAnalysis.domainId,
    primaryActors: intent.primaryUsers,
    secondaryActors: ["系统管理员"],
    coreResources: ["业务对象"],
    coreWorkflows: intent.coreUserJobs,
    dataObjects: ["业务记录"],
    lifecycleStages: ["草稿", "有效", "归档"],
    permissionBoundaries: ["普通用户", "管理员"],
    riskSurfaces: ["权限滥用", "数据错误"],
    operationalNeeds: ["后台管理", "部署运维"],
    reportingNeeds: ["数据导出"],
    integrationNeeds: [],
    deploymentAssumptions: ["标准服务器或云平台部署"],
    uncertaintyNotes: ["fallback intent generated for compatibility."],
  };

  return synthesizeRoutes(fallbackIntent, domainAnalysis, fallbackCapabilities, evidenceLedger);
}