import { guardJsonOutput } from "./schema-guard.js";
import { saveLLMRawOutput } from "./llm-run-recorder.js";
import type { LLMJsonRequest, LLMJsonResult, LLMProvider, SchemaGuardResult, SchemaRepairRecord } from "./types.js";

interface MockProviderOptions {
  model?: string;
  behavior?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => item !== undefined)
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export class MockLLMProvider implements LLMProvider {
  readonly providerId = "mock-provider";
  readonly providerType = "mock" as const;
  readonly model: string;
  readonly behavior: string;

  constructor(options: MockProviderOptions = {}) {
    this.model = options.model ?? "mock-json-model";
    this.behavior = options.behavior ?? process.env.THINK_MOCK_LLM_BEHAVIOR ?? "valid";
  }

  medicalInternProductIntent<T>(request: LLMJsonRequest<T>): Record<string, unknown> {
    const input = asRecord(request.input);
    const goal = request.goal || (typeof input?.rawGoal === "string" ? input.rawGoal : "做一个医院实习轮转管理系统");
    return {
      rawGoal: goal,
      normalizedGoal: "设计医院实习轮转管理系统",
      domainId: "medical-intern-rotation-management",
      primaryActors: ["实习学生", "带教老师", "科室管理员"],
      secondaryActors: ["教学秘书", "医院教务", "考核负责人"],
      coreResources: ["轮转计划", "科室名额", "带教关系", "考勤记录", "出科考核", "请假审批"],
      coreWorkflows: ["轮转排期", "科室接收", "带教确认", "考勤登记", "请假审批", "出科评价"],
      dataObjects: ["学生档案", "轮转记录", "科室容量", "带教分配", "考核表"],
      lifecycleStages: ["待排期", "待确认", "轮转中", "待考核", "已出科", "归档"],
      permissionBoundaries: ["学生仅看本人轮转", "带教仅评估负责学生", "科室管理本科室容量"],
      riskSurfaces: ["轮转冲突", "科室超额", "带教遗漏", "考勤争议", "考核不公"],
      operationalNeeds: ["批量排期", "冲突处理", "异常审批", "通知提醒", "日志追踪"],
      reportingNeeds: ["轮转完成率", "科室负载", "学生考勤", "带教评价", "出科统计"],
      integrationNeeds: ["学生身份系统", "医院科室目录", "消息通知渠道"],
      deploymentAssumptions: ["医院内网或私有云部署", "权限分级运维", "审计日志留存"],
      uncertaintyNotes: ["需确认各科室轮转规则", "需确认考核模板", "需确认请假制度"],
    };
  }

  rawForRequest<T>(request: LLMJsonRequest<T>, attempt: number): string {
    const input = asRecord(request.input);
    if (this.behavior === "invalid") {
      return attempt === 1 ? "not json at all" : "{ invalid json";
    }
    if (this.behavior === "critic-one-invalid" && request.agentName === "CriticCouncil.SecurityCritic") {
      return "not json at all";
    }
    if (this.behavior === "fenced") {
      return `\`\`\`json\n${JSON.stringify(request.mockData ?? {}, null, 2)}\n\`\`\``;
    }
    if (this.behavior === "medical-product-intent" && request.agentName === "ProductIntentBuilder") {
      return JSON.stringify(this.medicalInternProductIntent(request), null, 2);
    }
    if (this.behavior === "product-expansion-missing-fields" && request.agentName === "ProductGradeExpander") {
      const includeRequired = attempt > 1;
      const capability = (id: string, name: string, priority: string, description: string): Record<string, unknown> => ({
        id,
        name,
        priority,
        description,
        ...(includeRequired ? {
          whyItMatters: `${name} 对成品级方案必要。`,
          acceptanceSignal: `${name} 有可检查验收信号。`,
        } : {}),
        triggeredBy: ["goal"],
        riskIfMissing: "会退化成简陋 demo",
      });
      return JSON.stringify({
        goalSummary: "测试产品扩展",
        productGradePrinciples: ["必须避免简陋 demo"],
        userRoles: ["用户", "管理员"],
        coreCapabilities: [
          capability("cap-1", "能力一", "must", "描述一"),
          capability("cap-2", "能力二", "must", "描述二"),
          capability("cap-3", "能力三", "should", "描述三"),
        ],
        operationalCapabilities: [],
        nonFunctionalRequirements: [],
        demoTrapsToAvoid: ["只有表单"],
      }, null, 2);
    }
    if (
      (this.behavior === "low-critic-score" || this.behavior === "invalid-revision-title-only") &&
      String(request.agentName).startsWith("CriticCouncil.")
    ) {
      const critic = String(request.agentName).split(".").pop() ?? "ProductCritic";
      const strategies = recordArray(input?.strategyCandidates);
      return JSON.stringify(strategies.map((strategy) => ({
        critic,
        strategyId: strategy.id,
        score: 4.2,
        strengths: [`${critic} sees a plausible planning direction.`],
        objections: [`${critic} says route ${strategy.id} is not coding-ready.`],
        requiredImprovements: ["Resolve missing evidence and blocking workflow details."],
        blockingIssues: ["Critic average below coding handoff threshold."],
        evidenceRefs: ["E-GOAL-001"],
        disagreementLevel: "high",
      })), null, 2);
    }
    if ((this.behavior === "valid-revision" || this.behavior === "invalid-revision-title-only") && request.agentName === "StrategyRevisionAgent") {
      const mockData = asRecord(request.mockData);
      const currentStrategies = recordArray(input?.currentStrategies ?? mockData?.revisedStrategies);
      const titleOnly = this.behavior === "invalid-revision-title-only";
      const revisedStrategies = currentStrategies.map((strategy) => ({
        ...strategy,
        title: `${strategy.title} 修订版`,
        ...(titleOnly ? {} : {
          thesis: `${String(strategy.thesis ?? "")} 修订后加入阻断澄清门禁和证据追踪。`,
          architectureShape: [...stringArray(strategy.architectureShape), "blocking-clarification-gate"],
          productCoverage: [...stringArray(strategy.productCoverage), "阻断问题澄清"],
          securityAndAbuseResistance: [...stringArray(strategy.securityAndAbuseResistance), "critic-objection-traceability"],
          operationalModel: [...stringArray(strategy.operationalModel), "修订后路线复评"],
          risks: [...stringArray(strategy.risks), "修订后仍可能因外部证据不足不能进入编码"],
          tradeoffSummary: "修订提升规划安全性，但不消除证据缺口。",
          revisionMeta: {
            revisionRound: Number(input?.revisionRound ?? 1),
            changedFields: ["thesis", "architectureShape", "productCoverage", "securityAndAbuseResistance", "operationalModel", "risks"],
            changedBecause: stringArray(asRecord(input?.selectedRoute)?.blockingReasons).length > 0
              ? stringArray(asRecord(input?.selectedRoute)?.blockingReasons)
              : ["blocked route"],
            criticObjectionsAddressed: ["critic objection addressed"],
            newTradeoffsIntroduced: ["slower coding handoff"],
            evidenceGapsStillUnresolved: ["ME-001", "ME-002"],
          },
        }),
      }));
      return JSON.stringify({
        revisionRound: Number(input?.revisionRound ?? 1),
        reasonForRevision: "Selected route is blocked.",
        blockingIssuesAddressed: ["critic objection addressed"],
        unresolvedBlockingIssues: stringArray(asRecord(input?.selectedRoute)?.requiredClarificationsBeforeCoding).length > 0
          ? stringArray(asRecord(input?.selectedRoute)?.requiredClarificationsBeforeCoding)
          : ["ME-001"],
        revisedStrategies,
        strategyChangeLog: revisedStrategies.map((strategy) => ({
          strategyId: String(asRecord(strategy)?.id ?? "unknown"),
          changedFields: titleOnly ? ["title"] : ["thesis", "architectureShape", "productCoverage", "securityAndAbuseResistance", "operationalModel", "risks"],
          changedBecause: stringArray(asRecord(input?.selectedRoute)?.blockingReasons).length > 0
            ? stringArray(asRecord(input?.selectedRoute)?.blockingReasons)
            : ["blocked route"],
          criticObjectionsAddressed: ["critic objection addressed"],
          newTradeoffsIntroduced: ["slower coding handoff"],
          evidenceGapsStillUnresolved: ["ME-001", "ME-002"],
        })),
        riskChangeLog: revisedStrategies.map((strategy) => ({
          strategyId: String(asRecord(strategy)?.id ?? "unknown"),
          addedRisks: ["修订后仍可能因外部证据不足不能进入编码"],
          reducedRisks: ["critic objection addressed"],
          remainingRisks: stringArray(strategy.risks),
        })),
        evidenceGapsStillAccepted: ["ME-001", "ME-002"],
        canReRunSelection: true,
        shouldStopRevision: true,
        stopReason: "Reached THINK_ROUTE_REVISION_MAX_ROUNDS.",
      }, null, 2);
    }
    return JSON.stringify(request.mockData ?? {}, null, 2);
  }

  async completeJson<T>(request: LLMJsonRequest<T>): Promise<LLMJsonResult<T>> {
    const started = Date.now();
    const maxAttempts = Math.max(1, request.maxRetries ?? 1);
    const rawOutputSavedPaths: string[] = [];
    let lastRawText = "";
    let lastGuard: SchemaGuardResult<T> = {
      ok: false,
      data: undefined,
      repaired: false,
      validationErrors: ["No attempt was made."],
      qualityChecklistFailures: [],
      canonicalizationApplied: [],
      missingFieldRepairs: [],
    };
    const schemaRepairAttempts: unknown[] = [];
    const canonicalizationApplied: SchemaRepairRecord[] = [];
    const missingFieldRepairs: SchemaRepairRecord[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      lastRawText = this.rawForRequest(request, attempt);
      rawOutputSavedPaths.push(await saveLLMRawOutput(request.runDir, request.agentName, attempt, lastRawText, attempt > 1 ? "repair" : ""));
      lastGuard = guardJsonOutput(lastRawText, request);
      canonicalizationApplied.push(...(lastGuard.canonicalizationApplied ?? []));
      missingFieldRepairs.push(...(lastGuard.missingFieldRepairs ?? []));
      if (lastGuard.ok) break;
      if (attempt < maxAttempts) {
        schemaRepairAttempts.push({
          fromAttempt: attempt,
          repairAttempt: attempt + 1,
          errors: [
            ...(lastGuard.validationErrors ?? []),
            ...(lastGuard.qualityChecklistFailures ?? []),
          ],
        });
      }
    }

    return {
      ok: lastGuard.ok,
      data: lastGuard.data,
      rawText: lastRawText,
      repaired: lastGuard.repaired,
      errorCode: lastGuard.ok ? undefined : "SCHEMA_GUARD_FAILED",
      validationErrors: lastGuard.validationErrors,
      qualityChecklistFailures: lastGuard.qualityChecklistFailures,
      attempts: rawOutputSavedPaths.length,
      providerId: this.providerId,
      model: this.model,
      usage: {
        promptTokens: request.userPrompt.length,
        completionTokens: lastRawText.length,
        totalTokens: request.userPrompt.length + lastRawText.length,
      },
      latencyMs: Date.now() - started,
      fallbackUsed: false,
      fallbackReason: undefined,
      rawOutputSavedPaths,
      schemaRepairAttempts,
      canonicalizationApplied,
      missingFieldRepairs,
    };
  }
}