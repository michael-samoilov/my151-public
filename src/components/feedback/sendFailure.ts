import type { TFn, TnFn } from '@/i18n';
import type { FeedbackSendResult } from '@/lib/feedbackContext';

export type FeedbackSendFailure = Exclude<FeedbackSendResult, { ok: true }>;

export function sendFailureMessage(failure: FeedbackSendFailure, t: TFn, tn: TnFn): string {
  switch (failure.reason) {
    case 'offline': return t('feedback.failedOffline');
    case 'server': return t('feedback.failedServer');
    case 'busy': return failure.retryMinutes < 60
      ? tn('feedback.failedBusyMinutes', failure.retryMinutes)
      : tn('feedback.failedBusyHours', Math.ceil(failure.retryMinutes / 60));
    case 'rejected': return t('feedback.failed');
  }
}
