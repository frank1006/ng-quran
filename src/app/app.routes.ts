import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { QuranComponent } from './pages/quran/quran.component';
import { QiblaComponent } from './pages/qibla/qibla.component';
import { SettingsComponent } from './pages/settings/settings.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: HomeComponent
  },
  {
    path: 'quran',
    component: QuranComponent
  },
  {
    path: 'qibla',
    component: QiblaComponent
  },
  {
    path: 'settings',
    component: SettingsComponent
  }
];
