import { ApplicationConfig, provideBrowserGlobalErrorListeners, ErrorHandler, isDevMode, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, ViewTransitionInfo, provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { errorInterceptor } from './interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/error-handler.service';

/** Route path of the page being shown, e.g. 'quran' or 'quran/:surahId' */
function pagePath(snapshot: ActivatedRouteSnapshot): string {
  let route = snapshot;
  while (route.firstChild) route = route.firstChild;
  return route.routeConfig?.path ?? '';
}

/**
 * Picks the page transition: opening a surah moves forward, leaving it moves back,
 * switching tabs crossfades (styles.css). On iOS a swipe-back already animates, so a
 * browser back/forward there skips ours instead of playing a second one.
 */
function onViewTransitionCreated({ transition, from, to }: ViewTransitionInfo): void {
  const trigger = inject(Router).currentNavigation()?.trigger;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (trigger === 'popstate' && isIos) {
    transition.skipTransition();
    return;
  }

  const fromDepth = pagePath(from).split('/').length;
  const toDepth = pagePath(to).split('/').length;
  const direction = toDepth > fromDepth ? 'vt-forward' : toDepth < fromDepth ? 'vt-back' : null;
  if (!direction) return;

  const root = document.documentElement;
  root.classList.add(direction);
  transition.finished.finally(() => root.classList.remove(direction));
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated })),
    provideHttpClient(
      withInterceptors([errorInterceptor])
    ),
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:5000'
    }),
    // Enable Service Worker in dev mode for notification testing
    ...(isDevMode() ? [] : [])
  ]
};
