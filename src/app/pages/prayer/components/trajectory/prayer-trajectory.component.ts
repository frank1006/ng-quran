import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrajectoryData, PrayerItemWithStatus } from './prayer-trajectory.types';
import { TrajectoryUtils } from './prayer-trajectory.utils';

@Component({
  selector: 'app-prayer-trajectory',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (trajectoryData()) {
      <div class="prayer-trajectory">
        <svg viewBox="0 0 600 160" class="trajectory-svg">
          <!-- Define masks and gradients -->
          <defs>
            <linearGradient id="trajectoryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:var(--color-accent-dark)" />
              @if (trajectoryData()?.progress !== undefined) {
                <stop [attr.offset]="getGradientOffset(trajectoryData()!.progress)" style="stop-color:var(--color-accent-dark)" />
                <stop [attr.offset]="getGradientOffset(trajectoryData()!.progress)" style="stop-color:var(--color-accent)" />
              }
              <stop offset="100%" style="stop-color:var(--color-accent)" />
            </linearGradient>
          </defs>

          <!-- Main trajectory curve: day/night cycle arc -->
          <path
            d="M 0 160 L 50 160 C 150 160, 240 40, 300 40 S 440 160, 540 160 L 600 160"
            fill="none"
            stroke="url(#trajectoryGradient)"
            stroke-width="4.5"
            stroke-linecap="round"
            class="trajectory-path"
          />

          <!-- Rounded endpoint marker at progress position -->
          @if (trajectoryData()?.endpointPosition) {
            <circle
              [attr.cx]="trajectoryData()!.endpointPosition.x"
              [attr.cy]="trajectoryData()!.endpointPosition.y"
              r="4.25"
              style="fill:var(--color-primary)"
              class="trajectory-endpoint"
            />
          }

          <!-- Prayer markers -->
          @if (trajectoryData()?.prayers && trajectoryData()?.curvePoints) {
            @for (prayer of trajectoryData()!.prayers; track prayer.key; let i = $index) {
              @if (trajectoryData()!.curvePoints && trajectoryData()!.curvePoints[i]) {
                @let point = trajectoryData()!.curvePoints[i];
                @let isCurrent = getPrayerIsCurrent(prayer, i);
                @let hasPassed = getPrayerHasPassed(prayer);
                @let isNext = getPrayerIsNext(prayer);

                <g class="prayer-marker" [class.current]="isCurrent" [class.next]="isNext">
                  <!-- Marker circle -->
                  <circle
                    [attr.cx]="point.x"
                    [attr.cy]="point.y"
                    r="8"
                    [class.filled]="hasPassed"
                    [class.next-filled]="isNext"
                    class="marker-circle"
                  />
                </g>
              }
            }
          }
        </svg>
      </div>
    }
  `,
  styleUrls: ['./prayer-trajectory.component.css']
})
export class PrayerTrajectoryComponent {
  readonly trajectoryData = input<TrajectoryData | null>(null);

  protected getGradientOffset(progress: number | undefined): string {
    return TrajectoryUtils.getGradientOffset(progress);
  }

  protected getPrayerHasPassed(prayer: PrayerItemWithStatus): boolean {
    return prayer?.hasPassed === true;
  }

  protected getPrayerIsCurrent(prayer: PrayerItemWithStatus, index: number): boolean {
    if (prayer?.isCurrent !== undefined) {
      return prayer.isCurrent === true;
    }
    const trajectory = this.trajectoryData();
    return trajectory?.currentIndex === index;
  }

  protected getPrayerIsNext(prayer: PrayerItemWithStatus): boolean {
    return prayer?.isNext === true;
  }
}

