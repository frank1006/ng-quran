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
  <div 
      class="qibla-point">
      <img src="/kaaba.svg" alt="Qibla"class="qibla-point-svg"/>
    </div> 
    <div class="compass-container">
      <!-- SVG Compass with rotation -->
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
  `,
  styleUrls: ['./qibla-compass.component.css']
})
export class QiblaCompassComponent {
  readonly qiblaBearing = input<number>(0); // Bearing to Makkah (0-360)
  readonly currentHeading = input<number | null>(0); // Device heading (0-360)

  /**
   * Calculate rotation angle for compass ring
   * Device Orientation API alpha: 0° = North, 90° = East, 180° = South, 270° = West
   * When device rotates clockwise, compass ring must rotate counter-clockwise to keep North fixed
   * 
   * On some devices (especially iOS), the coordinate system might be inverted
   * If North appears wrong, try inverting: use `heading` instead of `-heading`
   */
  readonly compassRotation = computed<number>(() => {
    const heading = this.currentHeading();
    if (heading === null || heading === undefined) {
      return 0;
    }
    // Device heading: 0° = North, increases clockwise (standard)
    // Compass ring must rotate OPPOSITE to keep North pointing up
    // 
    // When device rotates 90° clockwise (facing East), 
    // compass ring rotates -90° counter-clockwise to keep North at top
    // 
    // Standard formula: rotation = -heading
    // This keeps North always pointing up regardless of device orientation
    const rotation = -heading;
    
    return Math.round(rotation * 10) / 10;
  });

  /**
   * Calculate the angle for Qibla indicator relative to screen
   * Qibla bearing: absolute direction to Makkah (0-360°, where 0° = North)
   * Device heading: direction device is facing (0° = North, 90° = East)
   * 
   * Since the compass dial rotates by -heading to keep North at top,
   * the Qibla indicator needs to be positioned relative to the rotated compass.
   * 
   * Formula: qiblaAngle = qiblaBearing - heading
   * This gives us where Qibla is relative to device's current facing direction.
   * 
   * Then we need to account for the compass dial rotation:
   * Final angle = (qiblaBearing - heading) + compassRotation
   * Simplified: = (qiblaBearing - heading) - heading = qiblaBearing - 2*heading
   * 
   * Actually, since compass rotates by -heading, and Qibla is relative to device:
   * Final Qibla angle = qiblaBearing (absolute) + compassRotation
   * = qiblaBearing - heading
   */
  readonly qiblaAngle = computed<number>(() => {
    const bearing = this.qiblaBearing();
    const heading = this.currentHeading();
    
    if (heading === null || heading === undefined) {
      // If no heading, show Qibla at its absolute bearing position
      return bearing;
    }
    
    // Qibla bearing is absolute (0° = North)
    // Compass dial rotates by -heading to keep North at top
    // So Qibla indicator should be at: bearing - heading
    // This positions it correctly on the rotated compass dial
    let angle = bearing - heading;
    
    // Normalize to 0-360 range
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    
    return Math.round(angle * 10) / 10;
  });
}
