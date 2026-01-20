import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-radius-filter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './radius-filter.component.html',
  styleUrl: './radius-filter.component.css'
})
export class RadiusFilterComponent {
  readonly radius = input<number>(1);
  readonly loading = input<boolean>(false);
  readonly radiusChange = output<number>();

  protected readonly radiusOptions = [1, 2, 3, 5, 10];

  protected onRadiusChange(newRadius: number): void {
    this.radiusChange.emit(newRadius);
  }
}

