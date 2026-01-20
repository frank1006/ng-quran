import { Injectable, computed, inject } from '@angular/core';
import { UserStoreService } from './user-store.service';
import { TimeFormat } from '@shared-utils';

export { TimeFormat } from '@shared-utils';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly userStore = inject(UserStoreService);
  
  readonly currentTimeFormat = computed(() => {
    const storedFormat = this.userStore.timeFormat();
    // Return stored format or default to 24-hour format
    return storedFormat ?? TimeFormat.TWENTY_FOUR_HOUR;
  });

  setTimeFormat(format: TimeFormat): void {
    this.userStore.setTimeFormat(format);
  }
}

