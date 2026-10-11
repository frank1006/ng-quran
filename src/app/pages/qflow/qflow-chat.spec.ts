import { QFlowExchange, shownAbove, withoutUnansweredGreetings } from './qflow-chat.store';
import { QFlowAyah } from './qflow.service';

const greeting = (id: number, date: string): QFlowExchange =>
  ({ id, kind: 'welcome', welcome: { date, greeting: 'Assalamu alaikum', today: '', suggestions: [] }, question: '', lang: 'en', status: 'done' });
const question = (id: number): QFlowExchange => ({ id, question: 'What is sabr?', lang: 'en', status: 'done' });
const ids = (list: QFlowExchange[]) => list.map(e => e.id);

describe('withoutUnansweredGreetings', () => {
  it('drops greetings from days when nothing was asked', () => {
    const list = [greeting(1, '2026-10-08'), greeting(2, '2026-10-09'), greeting(3, '2026-10-10')];
    expect(ids(withoutUnansweredGreetings(list, '2026-10-10'))).toEqual([3]);
  });

  it("keeps the greeting of a day that has questions, as that day's heading", () => {
    const list = [greeting(1, '2026-10-08'), question(2), greeting(3, '2026-10-09'), greeting(4, '2026-10-10')];
    expect(ids(withoutUnansweredGreetings(list, '2026-10-10'))).toEqual([1, 2, 4]);
  });

  it("drops yesterday's unanswered greeting before today's is added", () => {
    const list = [greeting(1, '2026-10-08'), question(2), greeting(3, '2026-10-09')];
    expect(ids(withoutUnansweredGreetings(list, '2026-10-10'))).toEqual([1, 2]);
  });

  it('leaves a conversation with nothing to tidy as it is', () => {
    const list = [greeting(1, '2026-10-10'), question(2)];
    expect(withoutUnansweredGreetings(list, '2026-10-10')).toEqual(list);
  });
});

describe('shownAbove', () => {
  const answered = (id: number, tafsir: boolean): QFlowExchange => ({
    ...question(id),
    result: {
      mode: 'ai',
      answer: 'Ayat al-Kursi',
      ayahs: [{ ref: '2:255' } as QFlowAyah],
      tafsirs: tafsir ? [{ ref: '2:255', key: 'ibn-kathir', name: 'Tafsir Ibn Kathir', lang: 'en', covers: ['2:255'], text: '…', part: 1, parts: 4 }] : [],
    },
  });

  it('gives the ayahs and the tafsir under the last answer', () => {
    expect(shownAbove([answered(1, false), answered(2, true)])).toEqual({ ayahs: ['2:255'], tafsir: { ref: '2:255', key: 'ibn-kathir', lang: 'en' } });
  });

  it('gives no tafsir when the last answer showed none', () => {
    expect(shownAbove([answered(1, true), answered(2, false)])).toEqual({ ayahs: ['2:255'], tafsir: undefined });
  });

  it('gives nothing when the last item is not an answer', () => {
    expect(shownAbove([answered(1, true), greeting(2, '2026-10-10')])).toBeUndefined();
    expect(shownAbove([])).toBeUndefined();
  });
});
