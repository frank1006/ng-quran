import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { locationDeniedMessage } from './location-help';

/**
 * QuranFlow also ships as an Android app (studio repo: apps/quranflow), which runs these same
 * pages from files inside the app. This file is what the pages need to know about it.
 */

/** True inside the Android app, false on the website */
export const isNativeApp = Capacitor.isNativePlatform();

/** The live site, which serves the API to the app (its pages are on the phone, not on a server) */
const API_ORIGIN = 'https://qflowai.jahaznova.com';

/** Our API's address: relative on the website, the live site's in the app */
export function apiUrl(path: string): string {
  return isNativeApp && path.startsWith('/api/') ? API_ORIGIN + path : path;
}

/** One prayer alarm for the phone: when, which prayer, its text, and how it sounds */
export interface PrayerAlarm {
  /** Unique per prayer and day, e.g. "2026-10-18|dhuhr" */
  id: string;
  /** Epoch milliseconds */
  at: number;
  prayer: string;
  title: string;
  body: string;
  /**
   * 'adhan' plays the full adhan with a Stop button; 'sound' uses the phone's notification sound;
   * 'vibrate' vibrates without sound; 'silent' does neither
   */
  mode: 'adhan' | 'sound' | 'vibrate' | 'silent';
}

export interface AlarmStatus {
  notifications: 'granted' | 'denied' | 'prompt';
  /** Whether alarms ring on the minute (Android 12+ needs "Alarms & reminders" allowed) */
  exactAlarms: boolean;
  /** Whether the phone lets QuranFlow run without battery limits (limits can delay the adhan) */
  batteryUnrestricted: boolean;
  /** The last reminder that rang over a minute late, until dismissed */
  lateRing: LateRing | null;
}

/** A reminder that rang late: the phone may be holding QuranFlow back to save battery */
export interface LateRing {
  prayer: string;
  minutesLate: number;
  /** When it was due (ms) */
  at: number;
}

/** The app's native prayer alarms (apps/quranflow: android/.../adhan/AdhanAlarmPlugin.java) */
export interface AdhanAlarmPlugin {
  /** Replaces every stored alarm with these; they fire with the app closed and after a restart */
  schedule(options: { alarms: PrayerAlarm[] }): Promise<AlarmStatus & { count: number }>;
  cancelAll(): Promise<void>;
  /** Plays the adhan now, without changing the stored alarms (Fajr's adhan for 'fajr') */
  test(options: { prayer: string }): Promise<void>;
  /** Plays the notification sound once ('sound') or vibrates once ('vibrate'); quiet on a silent phone */
  preview(options: { kind: 'sound' | 'vibrate' }): Promise<void>;
  /** Stops an adhan that is playing */
  stop(): Promise<void>;
  status(): Promise<AlarmStatus>;
  /** Asks for the notification permission (only Android 13+ asks) */
  requestNotifications(): Promise<AlarmStatus>;
  /** The person has seen the note about a late reminder */
  dismissLateRing(): Promise<AlarmStatus>;
  /** QuranFlow's page in the phone's settings, where Battery is */
  openBatterySettings(): Promise<void>;
  /** Opens the app's "Alarms & reminders" setting (Android 12+) */
  openExactAlarmSettings(): Promise<void>;
}

export const AdhanAlarm = registerPlugin<AdhanAlarmPlugin>('AdhanAlarm');

/** The phone's compass (apps/quranflow: android/.../compass/CompassPlugin.java) */
export interface CompassPlugin {
  available(): Promise<{ available: boolean }>;
  /** Sends 'heading' events until stop(): degrees clockwise from true north */
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'heading', listener: (reading: { heading: number; accuracy: number }) => void): Promise<PluginListenerHandle>;
}

export const NativeCompass = registerPlugin<CompassPlugin>('Compass');

/**
 * Whether the app may read the location, without asking. The website's code never loads the
 * location plugin (it is only imported here, inside the app).
 */
export async function nativeLocationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const { location } = await Geolocation.checkPermissions();
    return location === 'granted' || location === 'denied' ? location : 'prompt';
  } catch {
    return 'unknown'; // e.g. location turned off on the phone
  }
}

/** The phone's location (asks for the permission when needed), with the web page's error codes */
export async function nativePosition(options: PositionOptions): Promise<{ latitude: number; longitude: number }> {
  const { Geolocation } = await import('@capacitor/geolocation');
  try {
    const { coords } = await Geolocation.getCurrentPosition(options);
    return { latitude: coords.latitude, longitude: coords.longitude };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    // Same codes as GeolocationPositionError: 1 denied, 2 unavailable, 3 timeout
    if (code.endsWith('0003')) throw { code: 1, message: locationDeniedMessage() };
    if (code.endsWith('0010')) {
      throw { code: 3, message: 'Finding your location took too long. Move somewhere with a clearer signal, then tap Try again.' };
    }
    throw { code: 2, message: 'Your location isn\'t available right now. Check that location is turned on, then tap Try again.' };
  }
}

/**
 * Google's web sign-in client (the one Supabase's Google provider uses): the app's ID tokens are
 * issued for it, so Supabase accepts them. Public, like everything in this file.
 */
const GOOGLE_WEB_CLIENT_ID = '1014376431724-15uk1c71vnkl4d8ldqc1ct5e27rj3ahe.apps.googleusercontent.com';

/** Android's Google account picker (apps/quranflow: android/.../auth/GoogleSignInPlugin.java) */
interface GoogleSignInPlugin {
  /** Rejects with code CANCELLED (the person closed it), NO_ACCOUNT or FAILED */
  signIn(options: { serverClientId: string; nonce?: string }): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
}

const NativeGoogleSignIn = registerPlugin<GoogleSignInPlugin>('GoogleSignIn');

/**
 * A Google ID token from the phone's account picker, and the nonce it carries (Supabase checks
 * that the token's nonce is the SHA-256 of the one it's given)
 */
export async function nativeGoogleIdToken(): Promise<{ idToken: string; nonce: string }> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const { idToken } = await NativeGoogleSignIn.signIn({ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: hashed });
  return { idToken, nonce };
}

/** Lets the next sign-in show the account picker again */
export function nativeGoogleSignOut(): Promise<void> {
  return NativeGoogleSignIn.signOut().catch(() => {});
}

/** The app itself (apps/quranflow: android/.../AppPlugin.java) */
interface AppInfoPlugin {
  /** The page has drawn: the launch screen can go */
  ready(): Promise<void>;
  info(): Promise<{ version: string; build: number }>;
  /** QuranFlow's page in the phone's settings ('notifications': its notification settings) */
  openSettings(options: { page?: 'app' | 'notifications' }): Promise<void>;
}

export const NativeApp = registerPlugin<AppInfoPlugin>('QuranFlowApp');

/** The phone's own geocoder (apps/quranflow: android/.../GeocoderPlugin.java), with Nominatim's field names */
interface GeocoderPlugin {
  reverse(options: { latitude: number; longitude: number }): Promise<{ address: Record<string, string> }>;
}

export const NativeGeocoder = registerPlugin<GeocoderPlugin>('Geocoder');
