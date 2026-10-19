import { HttpInterceptorFn } from '@angular/common/http';
import { apiUrl } from '../core/native-app';

/** In the Android app, sends our API calls (/api/...) to the live site */
export const apiOriginInterceptor: HttpInterceptorFn = (req, next) => {
  const url = apiUrl(req.url);
  return next(url === req.url ? req : req.clone({ url }));
};
