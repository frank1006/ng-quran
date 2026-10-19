import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';

/**
 * Reports about QuranFlow AI answers. Google Play requires that people can report offensive
 * AI answers without leaving the app. A report is one row in Supabase (ai_reports, see
 * supabase/migrations/20261019_ai_reports.sql) that only the developer can read.
 */
export type QFlowReportReason = 'wrong' | 'offensive' | 'other';

export const REPORT_REASONS: { value: QFlowReportReason; label: string }[] = [
  { value: 'wrong', label: 'Wrong or misleading' },
  { value: 'offensive', label: 'Offensive or harmful' },
  { value: 'other', label: 'Something else' },
];

export const REPORT_LIMITS = { note: 500, question: 1000, answer: 4000 } as const;

export interface QFlowReportRow {
  reason: QFlowReportReason;
  note: string | null;
  question: string;
  answer: string;
}

/** The row to store: trimmed, cut to the table's limits, an empty note left out */
export function reportRow(reason: QFlowReportReason, note: string, question: string, answer: string): QFlowReportRow {
  const cut = (text: string, max: number) => text.trim().slice(0, max);
  return {
    reason,
    note: cut(note, REPORT_LIMITS.note) || null,
    question: cut(question, REPORT_LIMITS.question),
    answer: cut(answer, REPORT_LIMITS.answer),
  };
}

@Injectable({ providedIn: 'root' })
export class QFlowReportService {
  private readonly auth = inject(AuthService);

  /** Stores the report; throws when the user isn't signed in or the request fails */
  async send(row: QFlowReportRow): Promise<void> {
    const supabase = await this.auth.client();
    if (!supabase || !this.auth.user()) throw new Error('Please sign in to report an answer.');
    const { error } = await supabase.from('ai_reports').insert(row);
    if (error) throw new Error(error.message);
  }
}
