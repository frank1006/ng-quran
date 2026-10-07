import { DestroyRef, Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/**
 * Tells whether a line-clamped element is actually cut off, so "Read more" only shows when there
 * is more to read (how many characters fit depends on the screen width and font).
 * Usage: <p class="clamped" qflowClamped #clamp="clamp"> … @if (clamp.clamped()) { … }
 */
@Directive({ selector: '[qflowClamped]', exportAs: 'clamp' })
export class QFlowClampedDirective {
  readonly clamped = signal(false);

  constructor() {
    const el: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // Re-checked when the width changes. While the clamp is lifted ("Read more" was tapped) the
      // text fits by definition, so the last answer is kept and "Show less" stays put
      const observer = new ResizeObserver(() => {
        if (getComputedStyle(el).webkitLineClamp === 'none') return;
        this.clamped.set(el.scrollHeight > el.clientHeight + 1);
      });
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
