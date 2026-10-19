import { Directive, input, output } from '@angular/core';

/**
 * Drag-to-close for a bottom sheet: put it on the part to grab (the handle and title) and give
 * it the sheet. The sheet follows the finger down; let go far or fast enough and it asks to be
 * closed (sheetDismiss), otherwise it springs back. A tap still reaches buttons in that area.
 */
@Directive({
  selector: '[appSheetDrag]',
  host: {
    '(pointerdown)': 'onStart($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onEnd($event)',
    '(pointercancel)': 'onEnd($event)',
    style: 'touch-action: none; cursor: grab;',
  },
})
export class SheetDragDirective {
  /** The sheet that moves */
  readonly sheet = input.required<HTMLElement>({ alias: 'appSheetDrag' });
  readonly sheetDismiss = output<void>();

  private drag: { pointerId: number; startY: number; startTime: number; dy: number; active: boolean } | null = null;

  protected onStart(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.drag = { pointerId: event.pointerId, startY: event.clientY, startTime: event.timeStamp, dy: 0, active: false };
  }

  protected onMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.dy = Math.max(0, event.clientY - drag.startY);
    // Only a real drag takes over; a tap still reaches the buttons here
    if (!drag.active && drag.dy > 8) {
      drag.active = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    if (drag.active) {
      const sheet = this.sheet();
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${drag.dy}px)`;
    }
  }

  protected onEnd(event: PointerEvent): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.active || event.pointerId !== drag.pointerId) return;
    const sheet = this.sheet();
    const speed = drag.dy / Math.max(1, event.timeStamp - drag.startTime); // px per ms
    sheet.style.transition = '';
    if (drag.dy > 120 || speed > 0.6) {
      // Closes from where the finger left it (the slide-out animation starts from here)
      this.sheetDismiss.emit();
      setTimeout(() => (sheet.style.transform = ''), 400);
    } else {
      sheet.style.transition = 'transform var(--motion-base) var(--ease-out)';
      sheet.style.transform = '';
      setTimeout(() => (sheet.style.transition = ''), 300);
    }
  }
}
