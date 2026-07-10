import type {
  AntiSimplificationFinding,
  AntiSimplificationReport,
  DomainAnalysis,
  EvidenceLedger,
  ProductExpansion,
  ProductIntentModel,
  RiskLevel,
  StrategyCandidate,
  SynthesizedCapability,
} from "../types/artifacts.js";

function hasAny(values: readonly string[], signals: readonly string[]): boolean {
  const joined = values.join(" ").toLowerCase();
  return signals.some((signal) => joined.includes(signal.toLowerCase()));
}

function policyForDomain(domainAnalysis: DomainAnalysis) {
  if (domainAnalysis.domainId === "attendance-checkin") {
    return {
      stance: "Reject check-in plans that treat attendance as a plain form instead of identity-bound, auditable presence proof.",
      bannedShortcutSolutions: ["HTML 表单 + localStorage", "无认证签到", "无防代签", "无审计", "无后台管理"],
      minimumProductBar: ["身份认证", "角色权限", "签到活动管理", "动态二维码", "异常审核", "导出", "审计", "部署"],
    };
  }
  if (domainAnalysis.domainId === "medical-quiz-practice") {
    return {
      stance: "Reject quiz plans that stop at a question list and ignore question-bank governance, explanations, learning records, and review loops.",
      bannedShortcutSolutions: ["只有题目列表", "无解析", "无错题本", "无题库管理", "无知识点体系", "无学习记录"],
      minimumProductBar: ["题库管理", "知识点体系", "解析管理", "错题本", "学习记录", "考试模式", "内容审核"],
    };
  }
  if (domainAnalysis.domainId === "schedule-calendar-management") {
    return {
      stance: "Reject timetable plans that are only static tables and ignore conflicts, resources, rescheduling, notifications, and permissions.",
      bannedShortcutSolutions: ["只有静态表格", "无冲突检测", "无调课机制", "无通知", "无权限", "无教室资源模型"],
      minimumProductBar: ["课程模型", "角色权限", "教室资源", "重复规则", "冲突检测", "调课", "通知", "备份"],
    };
  }
  return {
    stance: "Reject demo-shaped plans that ignore the product intent model: actors, resources, workflows, risks, lifecycle, reporting, and operations.",
    bannedShortcutSolutions: [
      "只有一个表单或列表",
      "有多角色但无权限系统",
      "有核心资源但无资源管理后台",
      "有流程但无状态机",
      "有记录但无导出统计或审计",
      "有长期运行需求但无部署备份",
    ],
    minimumProductBar: ["身份", "权限", "资源管理", "流程状态", "导出统计", "审计", "部署备份"],
  };
}

function capabilityIds(capabilities: SynthesizedCapability[]) {
  return new Set(capabilities.map((capability) => capability.id));
}

function ruleEvidenceRefs(ruleId: string, ledger?: EvidenceLedger) {
  if (!ledger) return ["E-PRINCIPLE-001"];
  const map: Record<string, string[]> = {
    "multi-actor-requires-permission": ["E-INTENT-001"],
    "resources-require-admin-management": ["E-INTENT-002"],
    "reservation-or-schedule-requires-conflict-detection": ["E-RISK-002", "E-RISK-001"],
    "approval-or-responsibility-requires-audit": ["E-RISK-003", "E-RISK-001"],
    "persistent-data-requires-export-statistics": ["E-REPORT-001"],
    "long-running-product-requires-deployment-backup": ["E-OPS-001"],
    "stateful-workflow-requires-lifecycle-state-machine": ["E-STATE-001"],
  };
  return (map[ruleId] ?? ["E-PRINCIPLE-001"]).filter((ref) => ledger.evidenceItems.some((item) => item.id === ref));
}

function compositionalRules(productIntent: ProductIntentModel, capabilities: SynthesizedCapability[], ledger?: EvidenceLedger) {
  const ids = capabilityIds(capabilities);
  const actors = [...productIntent.primaryActors, ...productIntent.secondaryActors];
  const resourceEvidence = productIntent.coreResources;
  const workflowEvidence = productIntent.coreWorkflows;
  const riskEvidence = productIntent.riskSurfaces;
  const dataEvidence = productIntent.dataObjects;
  const deploymentEvidence = productIntent.deploymentAssumptions;

  const definitions = [
    {
      ruleId: "multi-actor-requires-permission",
      ruleName: "Multi actor requires permission",
      condition: actors.length > 1,
      requiredCapability: "role-permission",
      reason: "如果有多角色但没有权限系统，方案会过度简陋。",
      evidence: actors.map((actor) => `actor:${actor}`),
    },
    {
      ruleId: "resources-require-admin-management",
      ruleName: "Core resources require admin management",
      condition: resourceEvidence.length > 0,
      requiredCapability: "resource-management/admin-console",
      reason: "如果有核心资源但没有资源管理后台，方案会过度简陋。",
      evidence: resourceEvidence.map((resource) => `resource:${resource}`),
    },
    {
      ruleId: "reservation-or-schedule-requires-conflict-detection",
      ruleName: "Reservation, schedule, or capacity requires conflict detection",
      condition: hasAny([...workflowEvidence, ...riskEvidence, ...resourceEvidence], ["预约", "排期", "时段", "课程", "教室", "名额", "容量", "冲突"]),
      requiredCapability: "conflict-detection",
      reason: "如果有预约/排期/时段/容量但没有冲突检测，方案会过度简陋。",
      evidence: [...workflowEvidence, ...riskEvidence, ...resourceEvidence].map((item) => `signal:${item}`),
    },
    {
      ruleId: "approval-or-responsibility-requires-audit",
      ruleName: "Approval or responsibility requires audit",
      condition: hasAny([...workflowEvidence, ...riskEvidence, ...productIntent.lifecycleStages], ["审批", "审核", "确认", "责任", "损坏", "异常", "成果", "变更"]),
      requiredCapability: "audit-log/review-and-approval",
      reason: "如果有审批/异常/责任追踪但没有审计日志，方案会过度简陋。",
      evidence: [...workflowEvidence, ...riskEvidence].map((item) => `signal:${item}`),
    },
    {
      ruleId: "persistent-data-requires-export-statistics",
      ruleName: "Persistent data requires export and statistics",
      condition: dataEvidence.length > 2 || productIntent.reportingNeeds.length > 0,
      requiredCapability: "import-export/analytics-reporting",
      reason: "如果有数据沉淀但没有导出/统计，方案会过度简陋。",
      evidence: [...dataEvidence, ...productIntent.reportingNeeds].map((item) => `data:${item}`),
    },
    {
      ruleId: "long-running-product-requires-deployment-backup",
      ruleName: "Long-running product requires deployment and backup",
      condition: deploymentEvidence.length > 0,
      requiredCapability: "deployment-operation/backup-recovery",
      reason: "如果有长期运行需求但没有部署/备份，方案会过度简陋。",
      evidence: deploymentEvidence.map((item) => `deployment:${item}`),
    },
    {
      ruleId: "stateful-workflow-requires-lifecycle-state-machine",
      ruleName: "Stateful workflow requires lifecycle state machine",
      condition: productIntent.lifecycleStages.length > 2,
      requiredCapability: "lifecycle-state-machine",
      reason: "如果有状态流转但没有生命周期状态机，方案会过度简陋。",
      evidence: productIntent.lifecycleStages.map((stage) => `stage:${stage}`),
    },
  ];

  return definitions.map((definition) => {
    const alternatives = definition.requiredCapability.split("/");
    const satisfied = alternatives.some((id) => ids.has(id));
    return {
      ruleId: definition.ruleId,
      ruleName: definition.ruleName,
      triggered: definition.condition,
      triggeredBy: definition.evidence.slice(0, 8),
      evidenceRefs: ruleEvidenceRefs(definition.ruleId, ledger),
      consequenceIfIgnored: `Ignoring ${definition.ruleId} would allow a demo route to skip ${definition.requiredCapability}.`,
      reason: definition.condition
        ? `${definition.reason} 当前 Product Intent 触发了该检查；合成能力${satisfied ? "已覆盖" : "未覆盖"} ${definition.requiredCapability}。`
        : "当前 Product Intent 未触发该组合式反简陋规则。",
      evidence: definition.evidence.slice(0, 8),
      requiredCapability: definition.requiredCapability,
    };
  });
}

export function critiqueSimplification(
  expansion: ProductExpansion,
  strategies: StrategyCandidate[],
  domainAnalysis: DomainAnalysis,
  productIntent?: ProductIntentModel,
  synthesizedCapabilities: SynthesizedCapability[] = [],
  evidenceLedger?: EvidenceLedger,
): AntiSimplificationReport {
  const policy = policyForDomain(domainAnalysis);
  const compositionalRuleResults = productIntent
    ? compositionalRules(productIntent, synthesizedCapabilities, evidenceLedger)
    : [];
  const triggeredRules = compositionalRuleResults.filter((rule) => rule.triggered);

  const strategyFindings: AntiSimplificationFinding[] = strategies.map((strategy) => {
    const coverage = [
      ...strategy.productCoverage,
      ...(strategy.modules ?? []),
      ...(strategy.securityCapability ?? []),
      ...(strategy.operationalCapability ?? []),
    ].join(" ");
    const missingRules = triggeredRules.filter((rule) => {
      const alternatives = rule.requiredCapability.split("/");
      return !alternatives.some((id) => coverage.includes(id) || expansion.coreCapabilities.some((capability) => capability.id === id && coverage.includes(capability.name)));
    });
    const domainHits = policy.minimumProductBar.filter((item) => coverage.includes(item)).length;
    const findings: string[] = [];
    const requiredUpgrades: string[] = [];

    if (strategy.productCompletenessScore && strategy.productCompletenessScore < 7) {
      findings.push("Product completeness score is too low for a product-grade thinking route.");
      requiredUpgrades.push("Add capabilities triggered by actors, resources, workflows, risks, reporting, and deployment assumptions.");
    }
    if (domainHits < Math.min(3, policy.minimumProductBar.length)) {
      findings.push("Route does not mention enough domain-specific minimum product bar items.");
      requiredUpgrades.push("Add missing domain-specific demo-trap countermeasures.");
    }
    if (missingRules.length > 0) {
      findings.push(`Route misses compositional rules: ${missingRules.map((rule) => rule.ruleId).join(", ")}.`);
      requiredUpgrades.push("Make required synthesized capabilities explicit in route modules or operational/security capabilities.");
    }

    const simplificationRisk: RiskLevel =
      missingRules.length > 1 || strategy.demoTrapResistanceScore < 7
        ? "high"
        : missingRules.length === 1 || domainHits < 3
          ? "medium"
          : "low";

    return {
      strategyId: strategy.id,
      simplificationRisk,
      findings: findings.length > 0 ? findings : ["No fatal domain-specific or compositional demo shortcut detected."],
      requiredUpgrades,
      pass: simplificationRisk !== "high",
      evidenceRefs: Array.from(new Set([
        ...(strategy.evidenceRefs ?? []),
        ...missingRules.flatMap((rule) => rule.evidenceRefs ?? []),
        "E-PRINCIPLE-001",
      ])).filter(Boolean).slice(0, 6),
      rejectedBecause: missingRules.map((rule) => rule.reason),
      minimumBarEvidence: triggeredRules.flatMap((rule) => rule.evidenceRefs ?? []).slice(0, 6),
    };
  });

  return {
    stance: `${policy.stance} Compositional shortcuts are evaluated from the Product Intent Model, Evidence Providers, and Evidence Ledger.`,
    bannedShortcutSolutions: policy.bannedShortcutSolutions,
    minimumProductBar: policy.minimumProductBar,
    triggeredRules: triggeredRules.map((rule) => ({
      ruleId: rule.ruleId,
      ruleName: rule.ruleName ?? rule.ruleId,
      triggeredBy: rule.triggeredBy ?? rule.evidence,
      evidenceRefs: rule.evidenceRefs ?? [],
      consequenceIfIgnored: rule.consequenceIfIgnored ?? rule.reason,
    })),
    evidenceRefs: Array.from(new Set(triggeredRules.flatMap((rule) => rule.evidenceRefs ?? []))).slice(0, 8),
    rejectedBecause: strategyFindings.flatMap((finding) => finding.rejectedBecause ?? []).slice(0, 8),
    minimumBarEvidence: Array.from(new Set(triggeredRules.flatMap((rule) => rule.evidenceRefs ?? []))).slice(0, 8),
    compositionalRuleResults,
    strategyFindings,
  };
}