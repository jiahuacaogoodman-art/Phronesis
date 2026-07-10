import type {
  EvidenceLedger,
  EvidenceSourceType,
  EvidenceStrength,
  LedgerEvidenceItem,
  SourceQuality,
  VerificationStatus,
} from "../types/artifacts.js";

const strengthScores = {
  strong: 0.9,
  moderate: 0.74,
  weak: 0.56,
  absent: 0.24,
};

interface SourceQualityProfile {
  sourceQuality: SourceQuality;
  verificationStatus: VerificationStatus;
  applicability: NonNullable<LedgerEvidenceItem["applicability"]>;
  freshness: NonNullable<LedgerEvidenceItem["freshness"]>;
  biasRisk: NonNullable<LedgerEvidenceItem["biasRisk"]>;
  specificity: NonNullable<LedgerEvidenceItem["specificity"]>;
  evidenceStrength: EvidenceStrength;
}

interface EvidenceCoverage {
  strong: number;
  moderate: number;
  weak: number;
  missing: number;
  coverageScore: number;
  gapRefs: string[];
}

function bySourceType(sourceType: EvidenceSourceType): SourceQualityProfile {
  if (sourceType === "goal-input") {
    return {
      sourceQuality: "medium",
      verificationStatus: "observed",
      applicability: "direct",
      freshness: "current-run",
      biasRisk: "medium",
      specificity: "low",
      evidenceStrength: "moderate",
    };
  }
  if (sourceType === "intent-inference") {
    return {
      sourceQuality: "medium",
      verificationStatus: "inferred",
      applicability: "partial",
      freshness: "current-run",
      biasRisk: "medium",
      specificity: "medium",
      evidenceStrength: "moderate",
    };
  }
  if (sourceType === "risk-inference") {
    return {
      sourceQuality: "medium",
      verificationStatus: "inferred",
      applicability: "partial",
      freshness: "current-run",
      biasRisk: "medium",
      specificity: "medium",
      evidenceStrength: "moderate",
    };
  }
  if (sourceType === "route-analysis") {
    return {
      sourceQuality: "medium",
      verificationStatus: "inferred",
      applicability: "partial",
      freshness: "current-run",
      biasRisk: "medium",
      specificity: "medium",
      evidenceStrength: "moderate",
    };
  }
  if (sourceType === "critic-analysis") {
    return {
      sourceQuality: "low",
      verificationStatus: "inferred",
      applicability: "indirect",
      freshness: "current-run",
      biasRisk: "medium",
      specificity: "medium",
      evidenceStrength: "weak",
    };
  }
  if (sourceType === "product-principle" || sourceType === "domain-heuristic") {
    return {
      sourceQuality: sourceType === "domain-heuristic" ? "medium" : "low",
      verificationStatus: "assumed",
      applicability: "indirect",
      freshness: "static-principle",
      biasRisk: "high",
      specificity: sourceType === "domain-heuristic" ? "medium" : "low",
      evidenceStrength: "weak",
    };
  }
  return {
    sourceQuality: "missing",
    verificationStatus: "missing",
    applicability: "unknown",
    freshness: "requires-research",
    biasRisk: "high",
    specificity: "low",
    evidenceStrength: "absent",
  };
}

export function applySourceQuality(source: LedgerEvidenceItem): LedgerEvidenceItem {
  const quality = bySourceType(source.sourceType ?? "intent-inference");
  const verificationStatus =
    source.sourceType === "manual-research-placeholder" && source.notes.includes("unverified")
      ? "unverified"
      : quality.verificationStatus;
  return {
    ...source,
    sourceQuality: source.sourceQuality ?? quality.sourceQuality,
    verificationStatus: source.verificationStatus ?? verificationStatus,
    applicability: source.applicability ?? quality.applicability,
    freshness: source.freshness ?? quality.freshness,
    biasRisk: source.biasRisk ?? quality.biasRisk,
    specificity: source.specificity ?? quality.specificity,
    evidenceStrength: source.evidenceStrength ?? quality.evidenceStrength,
  };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function summarizeSourceQuality(evidenceItems: LedgerEvidenceItem[]): NonNullable<EvidenceLedger["sourceQualitySummary"]> {
  const bySourceQuality: Record<string, number> = {};
  const byVerificationStatus: Record<string, number> = {};
  const byEvidenceStrength: Record<string, number> = {};
  for (const item of evidenceItems) {
    increment(bySourceQuality, item.sourceQuality ?? "missing");
    increment(byVerificationStatus, item.verificationStatus ?? "missing");
    increment(byEvidenceStrength, item.evidenceStrength ?? "absent");
  }
  return {
    bySourceQuality,
    byVerificationStatus,
    byEvidenceStrength,
    totalEvidenceItems: evidenceItems.length,
  };
}

export function evidenceStrengthScore(strength: EvidenceStrength | undefined): number {
  return strengthScores[strength ?? "absent"] ?? strengthScores.absent;
}

export function evidenceCoverageForRefs(refs: string[], ledger: EvidenceLedger): EvidenceCoverage {
  const coverage: EvidenceCoverage = {
    strong: 0,
    moderate: 0,
    weak: 0,
    missing: 0,
    coverageScore: 0,
    gapRefs: [],
  };
  for (const ref of refs) {
    const item = ledger.evidenceItems.find((evidence) => evidence.id === ref);
    if (item) {
      const strength = item.evidenceStrength ?? "absent";
      if (strength === "strong") coverage.strong += 1;
      if (strength === "moderate") coverage.moderate += 1;
      if (strength === "weak") coverage.weak += 1;
      if (strength === "absent") coverage.missing += 1;
      continue;
    }
    if (ledger.missingEvidence.some((missing) => missing.id === ref) || ref.startsWith("ME-")) {
      coverage.missing += 1;
      coverage.gapRefs.push(ref);
    }
  }
  const total = coverage.strong + coverage.moderate + coverage.weak + coverage.missing;
  const weighted = coverage.strong * 1 + coverage.moderate * 0.72 + coverage.weak * 0.42;
  coverage.coverageScore = Number((total === 0 ? 0 : weighted / total).toFixed(2));
  return coverage;
}

export function weakEvidenceWarnings(evidenceItems: LedgerEvidenceItem[]): string[] {
  return evidenceItems
    .filter((item) => item.evidenceStrength === "weak" || item.evidenceStrength === "absent" || item.sourceQuality === "low" || item.sourceQuality === "missing")
    .map((item) => `${item.id}: ${item.sourceType} is ${item.sourceQuality}/${item.evidenceStrength}; ${item.claim}`)
    .slice(0, 12);
}