import { Component, input, output } from '@angular/core';
import { LocationChipComponent } from '../../../../shared/components/location-chip/location-chip.component';
import { MASJID_RADIUS_OPTIONS_KM } from '../../../../services/masjid.service';

@Component({
  selector: 'app-radius-filter',
  standalone: true,
  imports: [LocationChipComponent],
  templateUrl: './radius-filter.component.html',
  styleUrl: './radius-filter.component.css'
})
export class RadiusFilterComponent {
  readonly radius = input<number>(1);
  readonly loading = input<boolean>(false);
  readonly locationName = input<string>('Current Location');
  readonly locating = input<boolean>(false);
  /** Feedback line under the filters (auto-widened search, location problems), or empty */
  readonly note = input<string>('');
  readonly radiusChange = output<number>();
  readonly refreshLocation = output<void>();

  protected readonly radiusOptions = MASJID_RADIUS_OPTIONS_KM;

  protected onRadiusChange(newRadius: number): void {
    this.radiusChange.emit(newRadius);
  }
}
