import { Routes } from '@angular/router';
import { PrayerComponent } from './pages/prayer/prayer.component';

// Prayer is the landing page and loads eagerly; other pages load on first visit
// (the service worker still prefetches every chunk, so they work offline)
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
    loadComponent: () => import('./pages/quran/quran.component').then(m => m.QuranComponent)
  },
  {
    path: 'quran/:surahId',
    loadComponent: () =>
      import('./pages/quran/components/surah-detail.component').then(m => m.SurahDetailComponent)
  },
  {
    path: 'qibla',
    loadComponent: () => import('./pages/qibla/qibla.component').then(m => m.QiblaComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: '**',
    redirectTo: 'prayer'
  }
];
