import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class AttemptReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    appendFileSync(join(process.env.MY151_CI_RUN_DIR!, 'browser-attempts.ndjson'), `${JSON.stringify({
      endedAt: new Date().toISOString(), title: test.titlePath(), project: test.parent.project()?.name,
      status: result.status, expectedStatus: test.expectedStatus, retry: result.retry, durationMs: result.duration,
      errors: result.errors.map(error => error.message),
    })}\n`);
  }
  onEnd(result: FullResult) {
    writeFileSync(join(process.env.MY151_CI_RUN_DIR!, 'browser-result.json'), `${JSON.stringify(result)}\n`);
  }
}
