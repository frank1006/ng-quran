import { Component, input, output } from '@angular/core';
import { LocationChipComponent } from '../../../../shared/components/location-chip/location-chip.component';
import { DistanceUnit, radiusLabel } from '../../../../services/units';
import { SegmentedIndicatorDirective } from '../../../../shared/directives/segmented-indicator.directive';

@Component({
  selector: 'app-radius-filter',
  standalone: true,
  imports: [LocationChipComponent, SegmentedIndicatorDirective],
  templateUrl: './radius-filter.component.html',
  styleUrl: './radius-filter.component.css'
})
export class RadiusFilterComponent {
  readonly radius = input<number>(1);
  readonly loading = input<boolean>(false);
  /** Filter options in km (round numbers in the user's unit) */
  readonly options = input<number[]>([]);
  readonly unit = input<DistanceUnit>('km');
  readonly locationName = input<string>('Current Location');
  readonly locating = input<boolean>(false);
  /** Feedback line under the filters (auto-widened search, location problems), or empty */
  readonly note = input<string>('');
  readonly radiusChange = output<number>();
  readonly refreshLocation = output<void>();

  protected label(km: number): string {
    return radiusLabel(km, this.unit());
  }

  protected onRadiusChange(newRadius: number): void {
    this.radiusChange.emit(newRadius);
  }
}
