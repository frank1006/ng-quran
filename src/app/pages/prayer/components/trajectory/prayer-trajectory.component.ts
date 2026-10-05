import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrajectoryData } from './prayer-trajectory.types';
import { TRAJECTORY_CONSTANTS as C } from './prayer-trajectory.constants';

@Component({
  selector: 'app-prayer-trajectory',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (trajectoryData(); as data) {
      <div class="prayer-trajectory" aria-hidden="true">
        <svg [attr.viewBox]="viewBox" class="trajectory-svg">
          <!-- Horizon: sunrise and Maghrib sit on this line -->
          <line class="trajectory-horizon" x1="0" [attr.y1]="data.horizonY" [attr.x2]="width" [attr.y2]="data.horizonY" />

          <!-- Whole day (light) and the part already elapsed (bold) -->
          <path class="trajectory-remaining" [attr.d]="data.fullPath" />
          @if (data.elapsedPath) {
            <path class="trajectory-elapsed" [attr.d]="data.elapsedPath" />
          }

          <!-- Prayer markers: filled once passed, ring while upcoming. Sunrise isn't a prayer: small sun icon -->
          @for (marker of data.markers; track marker.key) {
            @if (marker.key === 'sunrise') {
              <g class="sun-marker" [class.passed]="marker.hasPassed" [attr.transform]="'translate(' + marker.point.x + ' ' + marker.point.y + ')'">
                @for (angle of sunRayAngles; track angle) {
                  <line x1="0" y1="-9" x2="0" y2="-13" [attr.transform]="'rotate(' + angle + ')'" />
                }
                <circle r="5.5" />
              </g>
            } @else {
              <circle
                class="marker"
                [class.passed]="marker.hasPassed"
                [class.next]="marker.isNext"
                [attr.cx]="marker.point.x"
                [attr.cy]="marker.point.y"
                r="9"
              />
            }
          }

          <!-- Current time -->
          @if (data.now) {
            <circle class="now-halo" [attr.cx]="data.now.x" [attr.cy]="data.now.y" r="16" />
            <circle class="now-dot" [attr.cx]="data.now.x" [attr.cy]="data.now.y" r="8" />
          }
        </svg>
      </div>
    }
  `,
  styleUrls: ['./prayer-trajectory.component.css']
})
export class PrayerTrajectoryComponent {
  readonly trajectoryData = input<TrajectoryData | null>(null);

  protected readonly width = C.WIDTH;
  protected readonly viewBox = `0 0 ${C.WIDTH} ${C.HEIGHT}`;
  protected readonly sunRayAngles = [0, 45, 90, 135, 180, 225, 270, 315];
}
