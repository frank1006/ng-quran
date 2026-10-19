import { WMM_COEFFICIENTS, WMM_EPOCH } from './wmm2025';

/** WGS 84 ellipsoid: semi-major axis (km) and first eccentricity squared */
const WGS84_A = 6378.137;
const WGS84_E2 = 0.0066943799901413165;
/** The model's reference radius (km) */
const MODEL_RADIUS = 6371.2;
const MAX_DEGREE = 12;
const RAD = Math.PI / 180;

/** The coefficients as [n][m] tables, built once */
const g = table();
const h = table();
const gDot = table();
const hDot = table();
for (const [n, m, gnm, hnm, gd, hd] of WMM_COEFFICIENTS) {
  g[n][m] = gnm;
  h[n][m] = hnm;
  gDot[n][m] = gd;
  hDot[n][m] = hd;
}

/**
 * Magnetic declination: how many degrees magnetic north is east of true north at a place
 * (negative when west; about -10 in Toronto). A phone's compass points to magnetic north, so
 * true heading = magnetic heading + declination. Android's GeomagneticField uses the same model.
 *
 * @param latitude geodetic latitude, degrees
 * @param longitude degrees east
 * @param date when (the field drifts a little every year)
 * @param altitudeKm height above the WGS 84 ellipsoid
 */
export function magneticDeclination(latitude: number, longitude: number, date: Date = new Date(), altitudeKm = 0): number {
  return declinationAt(latitude, longitude, decimalYear(date), altitudeKm);
}

/** The same, for a decimal year (2025.5 is the middle of 2025), as NOAA's test values give it */
export function declinationAt(latitude: number, longitude: number, year: number, altitudeKm = 0): number {
  const dt = year - WMM_EPOCH;
  const lat = latitude * RAD;
  const lon = longitude * RAD;

  // Geodetic to geocentric spherical: radius and latitude from the Earth's centre
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const p = (primeVertical + altitudeKm) * cosLat;
  const z = (primeVertical * (1 - WGS84_E2) + altitudeKm) * sinLat;
  const r = Math.hypot(p, z);
  const geocentricLat = Math.asin(z / r);

  // Colatitude; at the poles the east component's 1/sin θ needs a nudge off zero
  const theta = Math.PI / 2 - geocentricLat;
  const cosT = Math.cos(theta);
  const sinT = Math.max(Math.sin(theta), 1e-10);

  // Gauss-normalized associated Legendre functions P[n][m](cos θ) and their θ derivatives
  // (Wertz, Spacecraft Attitude Determination and Control, appendix H)
  const P = table();
  const dP = table();
  P[0][0] = 1;
  for (let n = 1; n <= MAX_DEGREE; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        P[n][m] = sinT * P[n - 1][m - 1];
        dP[n][m] = sinT * dP[n - 1][m - 1] + cosT * P[n - 1][m - 1];
      } else {
        const k = n > 1 ? ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3)) : 0;
        P[n][m] = cosT * P[n - 1][m] - (n > 1 ? k * P[n - 2][m] : 0);
        dP[n][m] = cosT * dP[n - 1][m] - sinT * P[n - 1][m] - (n > 1 ? k * dP[n - 2][m] : 0);
      }
    }
  }

  // Field components in geocentric spherical coordinates (nT): north (−Bθ) and east (Bφ)
  let bTheta = 0;
  let bPhi = 0;
  let bR = 0;
  let schmidtN0 = 1;
  for (let n = 1; n <= MAX_DEGREE; n++) {
    // Schmidt semi-normalized coefficients to Gauss-normalized: S[n][m]
    schmidtN0 *= (2 * n - 1) / n;
    let schmidt = schmidtN0;
    const radial = (MODEL_RADIUS / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      if (m > 0) schmidt *= Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
      const gnm = schmidt * (g[n][m] + dt * gDot[n][m]);
      const hnm = schmidt * (h[n][m] + dt * hDot[n][m]);
      const cosM = Math.cos(m * lon);
      const sinM = Math.sin(m * lon);
      bR += radial * (n + 1) * (gnm * cosM + hnm * sinM) * P[n][m];
      bTheta -= radial * (gnm * cosM + hnm * sinM) * dP[n][m];
      bPhi -= (radial * m * (-gnm * sinM + hnm * cosM) * P[n][m]) / sinT;
    }
  }

  // Back to the geodetic frame: north tilts by the gap between the two latitudes
  const north = -bTheta;
  const down = -bR;
  const tilt = geocentricLat - lat;
  const x = north * Math.cos(tilt) - down * Math.sin(tilt);
  const y = bPhi;
  return Math.atan2(y, x) / RAD;
}

/** 2026-07-02 → 2026.5 */
function decimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

function table(): number[][] {
  return Array.from({ length: MAX_DEGREE + 1 }, () => new Array<number>(MAX_DEGREE + 1).fill(0));
}
