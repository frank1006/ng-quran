import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-qibla-compass',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="compass-wrapper">
      <div class="qibla-point">
        <img src="/kaaba.svg" alt="Qibla" class="qibla-point-svg"/>
      </div>
      <div class="compass-container">
        <div
          class="compass-svg-wrapper"
          [style.transform]="'rotate(' + compassRotation() + 'deg)'"
        >
          <img
            src="/Qibla.svg"
            alt="Qibla Compass"
            class="compass-svg"
          />
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./qibla-compass.component.css']
})
export class QiblaCompassComponent {
  readonly qiblaBearing = input<number>(0);
  readonly currentHeading = input<number | null>(0);

  readonly compassRotation = computed<number>(() => {
    const bearing = this.qiblaBearing();
    const heading = this.currentHeading();

    if (heading === null || heading === undefined) {
      const rotation = bearing % 360;
      return Math.round(rotation * 10) / 10;
    }

    const rotation = (bearing - heading + 360) % 360;
    return Math.round(rotation * 10) / 10;
  });
}
