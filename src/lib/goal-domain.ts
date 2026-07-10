import type { DomainAnalysis, DomainId } from "../types/artifacts.js";
import type { ProductIntentModel } from "../types/artifacts.js";

interface DomainRule {
  domainId: DomainId;
  domainName: string;
  signals: string[];
  summary: string;
}

const domainRules: DomainRule[] = [
  {
    domainId: "attendance-checkin",
    domainName: "Attendance / Check-In Product",
    signals: ["签到", "签退", "出勤", "考勤", "打卡", "checkin", "check-in", "attendance"],
    summary: "Goal mentions attendance or check-in workflows, so presence proof, identity, anti-proxy risk, audit, and organizer operations are central.",
  },
  {
    domainId: "medical-quiz-practice",
    domainName: "Medical Quiz / Practice Product",
    signals: ["医学", "刷题", "题库", "题目", "错题", "解析", "考试", "组卷", "知识点", "quiz", "question bank", "practice", "exam"],
    summary: "Goal mentions medical study or question practice, so question-bank governance, taxonomy, explanations, exam mode, learning records, and analytics are central.",
  },
  {
    domainId: "schedule-calendar-management",
    domainName: "Schedule / Calendar Management Product",
    signals: ["课程表", "课表", "排课", "调课", "停课", "教室", "日历", "日程", "schedule", "calendar", "timetable"],
    summary: "Goal mentions schedules or course timetables, so course models, recurrence, room resources, conflict detection, rescheduling, notifications, and calendar views are central.",
  },
];

function countMatches(goal: string, signals: string[]) {
  const lower = goal.toLowerCase();
  return signals.filter((signal) => lower.includes(signal.toLowerCase()));
}

export function analyzeGoalDomain(rawGoal: string): DomainAnalysis {
  const scored = domainRules
    .map((rule) => {
      const matchedSignals = countMatches(rawGoal, rule.signals);
      return {
        rule,
        matchedSignals,
        score: matchedSignals.length,
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    return {
      domainId: "generic-software-product",
      domainName: "Generic Software Product",
      confidence: 0.35,
      matchedSignals: [],
      reasoningSummary: "No strong domain-specific signals were found, so the core falls back to a generic product-grade software reasoning path.",
    };
  }

  const secondScore = scored[1]?.score ?? 0;
  const confidence = Math.min(0.96, 0.62 + best.score * 0.12 + Math.max(0, best.score - secondScore) * 0.05);

  return {
    domainId: best.rule.domainId,
    domainName: best.rule.domainName,
    confidence: Number(confidence.toFixed(2)),
    matchedSignals: best.matchedSignals,
    reasoningSummary: best.rule.summary,
  };
}

export function isDomain(domainAnalysis: DomainAnalysis, domainId: DomainId) {
  return domainAnalysis.domainId === domainId;
}

export function refineDomainAnalysisFromProductIntent(
  domainAnalysis: DomainAnalysis,
  productIntent: ProductIntentModel,
): DomainAnalysis {
  const text = [
    productIntent.normalizedGoal,
    productIntent.domainId,
    ...productIntent.primaryActors,
    ...productIntent.secondaryActors,
    ...productIntent.coreResources,
    ...productIntent.coreWorkflows,
    ...productIntent.riskSurfaces,
    ...productIntent.reportingNeeds,
  ].join(" ");
  const requiredSignals = ["医院", "实习", "轮转", "科室", "带教", "考核"];
  const matchedSignals = requiredSignals.filter((signal) => text.includes(signal));
  if (matchedSignals.length >= 4 || String(productIntent.domainId) === "medical-intern-rotation-management") {
    return {
      domainId: "medical-intern-rotation-management",
      domainName: "医院实习轮转管理",
      confidence: Math.max(0.75, domainAnalysis.confidence ?? 0),
      matchedSignals: Array.from(new Set([...domainAnalysis.matchedSignals, ...matchedSignals])),
      reasoningSummary: "ProductIntent-derived refinement found hospital internship rotation signals in actors, resources, workflows, and risks.",
    };
  }
  return domainAnalysis;
}