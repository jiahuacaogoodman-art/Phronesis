import type { TechnicalSolutionSearchResults } from "../types/artifacts.js";

interface SourceCandidate {
  url?: string;
  title?: string;
  snippet?: string;
}

export interface SolutionSourceClassification {
  sourceQuality: "A" | "B" | "C" | "Reject";
  sourceType: string;
  accepted: boolean;
  qualityReason: string;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function includesAny(value: unknown, signals: string[]): boolean {
  const text = String(value ?? "").toLowerCase();
  return signals.some((signal) => text.includes(String(signal).toLowerCase()));
}

export function classifySolutionSource(result: SourceCandidate): SolutionSourceClassification {
  const url = String(result.url ?? "");
  const host = hostFromUrl(url);
  const title = String(result.title ?? "");
  const snippet = String(result.snippet ?? "");
  const combined = `${host} ${title} ${snippet}`;

  if (!url || !title) {
    return { sourceQuality: "Reject", sourceType: "missing", accepted: false, qualityReason: "Missing URL or title." };
  }

  if (includesAny(combined, ["pricing", "request demo", "schedule a demo", "best software", "top 10", "dictionary", "definition", "meaning", "seo"])) {
    return { sourceQuality: "Reject", sourceType: "marketing-or-seo", accepted: false, qualityReason: "Marketing, SEO, dictionary, or non-technical page." };
  }

  const officialHosts = [
    "postgresql.org",
    "developers.google.com",
    "cloud.google.com",
    "docs.aws.amazon.com",
    "learn.microsoft.com",
    "docs.temporal.io",
    "owasp.org",
    "csrc.nist.gov",
    "docs.oracle.com",
    "docs.spring.io",
    "kubernetes.io",
  ];
  if (officialHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return { sourceQuality: "A", sourceType: "official technical documentation", accepted: true, qualityReason: "Official database, framework, cloud, standard, or engineering documentation." };
  }

  const matureEngineeringHosts = [
    "microservices.io",
    "martinfowler.com",
    "confluent.io",
    "stripe.com",
    "engineering.atspotify.com",
    "github.com",
    "gitlab.com",
    "arxiv.org",
    "queue.acm.org",
  ];
  if (matureEngineeringHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return { sourceQuality: "B", sourceType: "mature engineering guide or open-source documentation", accepted: true, qualityReason: "Engineering guide, open-source docs, or technical paper source." };
  }

  if (includesAny(combined, ["stackoverflow.com", "serverfault.com", "dba.stackexchange.com", "medium.com", "dev.to", "blog"])) {
    return { sourceQuality: "C", sourceType: "community or ordinary engineering blog", accepted: true, qualityReason: "Potentially useful but should not be treated as primary authority." };
  }

  if (includesAny(combined, ["documentation", "docs", "guide", "database", "constraint", "workflow", "audit", "outbox", "row level security", "authorization"])) {
    return { sourceQuality: "B", sourceType: "technical documentation or engineering article", accepted: true, qualityReason: "Looks technical and relevant, but source authority is not proven." };
  }

  return { sourceQuality: "Reject", sourceType: "low-relevance", accepted: false, qualityReason: "No strong technical relevance signal." };
}

export function acceptedSourceRefs(searchResults: TechnicalSolutionSearchResults | undefined): string[] {
  return (searchResults?.resultsByProblem ?? [])
    .flatMap((problem) => problem.queryResults ?? [])
    .flatMap((queryResult) => queryResult.results ?? [])
    .filter((result) => result.accepted)
    .map((result) => result.sourceRef);
}