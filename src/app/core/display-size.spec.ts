import { applyDisplaySize, readDisplaySize } from './display-size';

describe('Display size', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--ui-zoom');
  });

  it('is Standard until chosen', () => {
    expect(readDisplaySize()).toBe('standard');
  });

  it('scales the whole app evenly and remembers the choice', () => {
    applyDisplaySize('compact', true);
    expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe('0.92');
    expect(readDisplaySize()).toBe('compact');
  });

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('display-size', 'huge');
    expect(readDisplaySize()).toBe('standard');
  });
});
