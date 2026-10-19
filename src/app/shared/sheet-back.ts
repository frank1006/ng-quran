import { isNativeApp } from '../core/native-app';

/**
 * In the Android app, the phone's Back button closes an open sheet instead of leaving the page.
 * Opening adds a history entry (same address) and Back takes it off again, closing the sheet;
 * closing the sheet another way takes the entry off too. Call it when the sheet opens and the
 * returned function when it closes. On the website it does nothing.
 */
export function closeOnBack(close: () => void): () => void {
  if (!isNativeApp) return () => {};
  history.pushState({ ...history.state, sheet: true }, '');
  let done = false;
  const onBack = () => {
    if (done) return;
    done = true;
    removeEventListener('popstate', onBack);
    close();
  };
  addEventListener('popstate', onBack);
  return () => {
    if (done) return;
    done = true;
    removeEventListener('popstate', onBack);
    history.back();
  };
}
