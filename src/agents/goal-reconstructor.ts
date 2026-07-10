import type { DomainAnalysis, ReconstructedIntent } from "../types/artifacts.ts";

export function reconstructGoal(rawGoal: string, domainAnalysis: DomainAnalysis): ReconstructedIntent {
  const domainId = domainAnalysis.domainId;

  return {
    rawGoal,
    normalizedGoal: rawGoal.trim().replace(/\s+/g, " "),
    inferredProductCategory: domainId,
    primaryUsers: domainId === "attendance-checkin"
      ? ["participants", "organizers", "reviewers", "system administrators"]
      : domainId === "medical-quiz-practice"
        ? ["learners", "content editors", "teachers", "reviewers", "administrators"]
        : domainId === "schedule-calendar-management"
          ? ["students", "teachers", "academic administrators", "room managers", "system administrators"]
      : ["end users", "operators", "administrators", "support staff"],
    coreUserJobs: domainId === "attendance-checkin"
      ? [
          "create and manage attendance events",
          "prove presence with acceptable friction",
          "detect and review suspicious sign-ins",
          "export reliable attendance records",
        ]
      : domainId === "medical-quiz-practice"
        ? [
            "practice questions by category, chapter, and knowledge point",
            "review explanations and collect difficult questions",
            "simulate exams and generate randomized papers",
            "track learning progress and weak areas",
            "manage and review medical question content",
          ]
        : domainId === "schedule-calendar-management"
          ? [
              "manage courses, teachers, students, rooms, and time slots",
              "detect time and room conflicts before publishing schedules",
              "handle rescheduling, suspension, and recurring course rules",
              "notify affected users and sync calendar views",
              "import, export, back up, and audit schedule data",
            ]
      : [
          "complete the primary workflow reliably",
          "manage records and permissions",
          "monitor operational health",
          "export or audit important data",
        ],
    explicitConstraints: ["No implementation code should be produced in v0.1."],
    inferredConstraints: [
      "The solution should be product-grade rather than a single-screen demo.",
      "The first output must be a deliberation record that later coding agents can consume.",
      "Architecture should include security, operations, testing, and deployment considerations.",
    ],
    successCriteria: domainId === "attendance-checkin"
      ? [
          "The thinking output rejects a plain HTML form as insufficient.",
          "The product plan includes identity, permissions, dynamic proof, anti-proxy controls, audit, export, and admin operations.",
          "The selected route balances maturity, implementation cost, and abuse resistance.",
        ]
      : domainId === "medical-quiz-practice"
        ? [
            "The product plan includes question bank management, taxonomy, explanations, wrong-question book, exam mode, learning progress, and content review.",
            "The strategy candidates are about learning and content systems rather than check-in mechanics.",
            "The selected route balances content governance, learner experience, analytics, and maintainability.",
          ]
        : domainId === "schedule-calendar-management"
          ? [
              "The product plan includes course management, roles, room resources, recurrence, conflict detection, rescheduling, notifications, calendar view, import/export, and backup.",
              "The strategy candidates are about schedule and resource coordination rather than check-in mechanics.",
              "The selected route balances scheduling correctness, operational workflow, calendar UX, and integration options.",
            ]
      : [
          "The thinking output expands the vague goal into product-grade requirements.",
          "At least four routes are generated and criticized.",
          "The selected route is justified with explicit tradeoffs.",
        ],
    nonGoalsForThisRun: [
      "No UI implementation.",
      "No dashboard.",
      "No repository scanning.",
      "No source-code patch generation.",
      "No business implementation of the sample goal.",
    ],
    ambiguities: domainId === "attendance-checkin"
      ? [
          "Which identity provider is available?",
          "How strict should anti-proxy enforcement be?",
          "Will the system be used in classrooms, events, workplaces, or mixed settings?",
          "What privacy and retention rules apply?",
        ]
      : domainId === "medical-quiz-practice"
        ? [
            "Who owns and reviews medical question content?",
            "Should the system prioritize practice, formal exams, or both?",
            "What taxonomy is required: subject, chapter, disease, knowledge point, difficulty, or source?",
            "How should content quality, explanations, and answer corrections be governed?",
          ]
        : domainId === "schedule-calendar-management"
          ? [
              "Is this for personal schedules, class timetables, or institution-level course scheduling?",
              "What room, teacher, and student constraints are authoritative?",
              "Should it integrate with an existing academic affairs system?",
              "What notification channels and calendar sync targets are required?",
            ]
      : [
          "Target users are not fully specified.",
          "Deployment environment is unknown.",
          "Security and compliance requirements need confirmation.",
          "Budget and timeline are unspecified.",
        ],
  };
}