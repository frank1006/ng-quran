import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-connection-error',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './connection-error.component.html',
  styleUrl: './connection-error.component.css'
})
export class ConnectionErrorComponent {
  readonly errorMessage = input<string>('No internet connection. Please check your network and try again.');
  readonly retry = output<void>();

  onRetry(): void {
    this.retry.emit();
  }
}

