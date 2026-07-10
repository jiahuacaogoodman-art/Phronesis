export function classifyGoal(rawGoal: string): string {
  const lower = rawGoal.toLowerCase();
  if (rawGoal.includes("签到") || lower.includes("checkin") || lower.includes("attendance")) {
    return "attendance-and-participation-management";
  }
  if (rawGoal.includes("电商") || rawGoal.includes("商城") || lower.includes("commerce")) {
    return "transactional-product";
  }
  if (rawGoal.includes("crm") || rawGoal.includes("客户")) {
    return "workflow-and-operations-platform";
  }
  if (rawGoal.includes("学习") || rawGoal.includes("课程") || lower.includes("learning")) {
    return "learning-product";
  }
  return "general-software-product";
}

export function isAttendanceGoal(rawGoal: string): boolean {
  return classifyGoal(rawGoal) === "attendance-and-participation-management";
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}