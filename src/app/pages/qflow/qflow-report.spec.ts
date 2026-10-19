import { REPORT_LIMITS, reportRow } from './qflow-report';

describe('reportRow', () => {
  it('trims the text and leaves out an empty note', () => {
    expect(reportRow('wrong', '   ', ' What is sabr? ', ' Patience. ')).toEqual({
      reason: 'wrong',
      note: null,
      question: 'What is sabr?',
      answer: 'Patience.',
    });
  });

  it('keeps a note the user wrote', () => {
    expect(reportRow('offensive', ' Not respectful ', 'q', 'a').note).toBe('Not respectful');
  });

  it("cuts long text to the database's limits", () => {
    const row = reportRow('other', 'n'.repeat(900), 'q'.repeat(2000), 'a'.repeat(9000));
    expect(row.note!.length).toBe(REPORT_LIMITS.note);
    expect(row.question.length).toBe(REPORT_LIMITS.question);
    expect(row.answer.length).toBe(REPORT_LIMITS.answer);
  });
});
