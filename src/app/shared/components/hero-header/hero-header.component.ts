import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-hero-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hero-header.component.html',
  styleUrl: './hero-header.component.css'
})
export class HeroHeaderComponent {
  // Optional back button
  readonly backUrl = input<string | null>(null);
  readonly backLabel = input<string>('Back');

  // Optional action button on the right
  readonly showActionButton = input<boolean>(false);
  readonly actionButtonLabel = input<string>('');
  readonly actionButtonActive = input<boolean>(false);
  readonly actionButtonClick = input<(() => void) | null>(null);

  protected handleActionClick(): void {
    const handler = this.actionButtonClick();
    if (handler) {
      handler();
    }
  }
}

