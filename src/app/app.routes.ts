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
    title: 'Prayer times · QuranFlow',
    component: PrayerComponent
  },
  {
    path: 'quran',
    title: 'Quran · QuranFlow',
    loadComponent: () => import('./pages/quran/quran.component').then(m => m.QuranComponent)
  },
  {
    path: 'quran/:surahId',
    title: 'Surah · QuranFlow', // replaced with the surah's name once it loads
    loadComponent: () =>
      import('./pages/quran/components/surah-detail.component').then(m => m.SurahDetailComponent)
  },
  {
    path: 'qibla',
    title: 'Qibla · QuranFlow',
    loadComponent: () => import('./pages/qibla/qibla.component').then(m => m.QiblaComponent)
  },
  {
    path: 'profile',
    title: 'Profile · QuranFlow',
    loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    // QuranFlow AI: signed-in users ask; guests see a sign-in card
    path: 'qflow',
    title: 'QuranFlow AI',
    loadComponent: () => import('./pages/qflow/qflow.component').then(m => m.QFlowComponent)
  },
  {
    path: 'mission',
    title: 'Our mission · QuranFlow',
    loadComponent: () => import('./pages/mission/mission.component').then(m => m.MissionComponent)
  },
  {
    path: 'privacy',
    title: 'Privacy policy · QuranFlow',
    loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: '**',
    redirectTo: 'prayer'
  }
];
