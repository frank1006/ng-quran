import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Qibla compass component - Using SVG from public/Qibla.svg
 */
@Component({
  selector: 'app-qibla-compass',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="compass-wrapper">
      <!-- Qibla point - Static (fixed at top, pointing upward) -->
      <div class="qibla-point">
        <img src="/kaaba.svg" alt="Qibla" class="qibla-point-svg"/>
      </div>

      <!-- Compass container -->
      <div class="compass-container">
        <!-- SVG Compass with rotation - Rotates to align Qibla direction with static Qibla point -->
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
  readonly qiblaBearing = input<number>(0); // Bearing to Makkah (0-360)
  readonly currentHeading = input<number | null>(0); // Device heading (0-360)

  /**
   * Calculate rotation angle for compass dial
   *
   * The Qibla point stays static (fixed pointing upward at top of screen).
   * The compass dial rotates so that the Qibla bearing on the compass aligns with the static Qibla point.
   *
   * Formula: compassRotation = (bearing - heading + 360) % 360
   *
   * Explanation:
   * - Qibla bearing: Absolute direction to Makkah (0° = North, 90° = East, etc.)
   * - Device heading: Direction device is facing (0° = North, 90° = East, etc.)
   * - Static Qibla point: Fixed at top of screen (0°/North position)
   *
   * To align Qibla on compass with static point:
   * - If Qibla is at 90° (East) and device is facing 0° (North)
   *   → Compass needs to rotate 90° clockwise to show East at top
   *   → Rotation = (90° - 0° + 360) % 360 = 90°
   *
   * - If device rotates to face 90° (East)
   *   → Qibla bearing and device heading are aligned
   *   → Rotation = (90° - 90° + 360) % 360 = 0° (no rotation needed)
   *
   * - If Qibla is at 270° (West) and device faces 0° (North)
   *   → Rotation = (270° - 0° + 360) % 360 = 270°
   *
   * When device rotates clockwise (heading increases), compass counter-rotates
   * to keep Qibla aligned with the static point.
   */
  readonly compassRotation = computed<number>(() => {
    const bearing = this.qiblaBearing();
    const heading = this.currentHeading();

    // If no heading available, show Qibla bearing at top (no device rotation compensation)
    if (heading === null || heading === undefined) {
      // Rotate compass so Qibla bearing appears at top
      // Rotation = bearing (since heading is 0/unknown)
      let rotation = bearing % 360;
      return Math.round(rotation * 10) / 10;
    }

    // Calculate rotation to align Qibla bearing with static point
    // Formula: rotation = (bearing - heading + 360) % 360
    // This rotates the compass so that the Qibla bearing on the dial aligns with the top
    let rotation = (bearing - heading + 360) % 360;

    return Math.round(rotation * 10) / 10;
  });

}
