import { Routes } from '@angular/router';
import { PrayerComponent } from './pages/prayer/prayer.component';
import { QuranComponent } from './pages/quran/quran.component';
import { SurahDetailComponent } from './pages/quran/components/surah-detail.component';
import { QiblaComponent } from './pages/qibla/qibla.component';
import { SettingsComponent } from './pages/settings/settings.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'prayer',
    pathMatch: 'full'
  },
  {
    path: 'prayer',
    component: PrayerComponent
  },
  {
    path: 'quran',
    component: QuranComponent
  },
  {
    path: 'quran/:surahId',
    component: SurahDetailComponent
  },
  {
    path: 'qibla',
    component: QiblaComponent
  },
  {
    path: 'profile',
    component: SettingsComponent
  },
  {
    path: '**',
    redirectTo: 'prayer'
  }
];
