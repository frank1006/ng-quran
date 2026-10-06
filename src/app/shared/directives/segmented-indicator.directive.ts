import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Gives every `ui-segmented` control one amber pill that slides to the chosen segment,
 * instead of each segment switching its own background on and off.
 * The chosen segment is whichever has `is-on`; the pill follows it when that changes or the
 * control resizes. The first placement doesn't animate. Reduced motion makes the move instant.
 */
@Directive({
  selector: '.ui-segmented'
})
export class SegmentedIndicatorDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const pill = document.createElement('span');
      pill.className = 'ui-segmented-indicator';
      pill.setAttribute('aria-hidden', 'true');
      this.host.prepend(pill);
      this.host.classList.add('has-indicator');

      const place = () => {
        const active = this.host.querySelector<HTMLElement>(':scope > .ui-segment.is-on');
        if (!active) {
          pill.style.opacity = '0';
          return;
        }
        pill.style.opacity = '1';
        pill.style.width = `${active.offsetWidth}px`;
        pill.style.height = `${active.offsetHeight}px`;
        pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      };

      place();
      // Animate only after the first placement
      requestAnimationFrame(() => this.host.classList.add('is-ready'));

      const mutations = new MutationObserver(place);
      mutations.observe(this.host, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
      const resizes = new ResizeObserver(place);
      resizes.observe(this.host);

      this.destroyRef.onDestroy(() => {
        mutations.disconnect();
        resizes.disconnect();
      });
    });
  }
}
