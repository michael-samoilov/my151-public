export interface Discovery {
  suites: { file?: string; specs?: { tests: { projectName: string }[] }[]; suites?: Discovery['suites'] }[];
}

export function discoveryCounts(report: Discovery) {
  const counts = { total: 0, projects: {} as Record<string, number>, files: {} as Record<string, number> };
  function visit(suites: Discovery['suites']) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests) {
        counts.total++;
        counts.projects[test.projectName] = (counts.projects[test.projectName] ?? 0) + 1;
        const file = suite.file ?? 'unknown';
        counts.files[file] = (counts.files[file] ?? 0) + 1;
      }
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  return counts;
}
