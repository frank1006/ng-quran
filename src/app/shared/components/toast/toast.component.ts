import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../core/toast.service';

/**
 * The app's one toast: a small dark pill above the bottom nav (ToastService decides what it says).
 * It rises in and sinks out; tapping it sends it away early. Two live regions sit behind it so
 * screen readers hear a confirmation politely and a problem straight away.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let toast = toasts.toast();
    <div
      class="toast"
      [class.is-shown]="toasts.visible()"
      [class.toast--error]="toast?.tone === 'error'"
      [attr.aria-hidden]="true"
      (click)="toasts.dismiss()"
    >
      @if (toast?.tone === 'error') {
        <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7.5v5M12 16v.5"></path>
        </svg>
      }
      <span>{{ toast?.text }}</span>
    </div>
    <p class="visually-hidden" role="status">{{ toasts.visible() && toast?.tone === 'info' ? toast?.text : '' }}</p>
    <p class="visually-hidden" role="alert">{{ toasts.visible() && toast?.tone === 'error' ? toast?.text : '' }}</p>
  `,
  styleUrl: './toast.component.css',
})
export class ToastComponent {
  protected readonly toasts = inject(ToastService);
}
