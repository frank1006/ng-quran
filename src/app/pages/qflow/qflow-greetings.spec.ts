import { QFlowExchange, withoutUnansweredGreetings } from './qflow-chat.store';

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
