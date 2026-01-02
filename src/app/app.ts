import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BottomNavComponent, OfflineBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('ng-quran');
}
