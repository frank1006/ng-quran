/**
 * Example usage of PrayerTimeService
 * 
 * This file demonstrates how to use the PrayerTimeService
 * in your Angular components.
 */

import { Component, inject } from '@angular/core';
import { PrayerTimeService } from './prayer-time.service';
import { PrayerTimeData } from './prayer-time.types';

@Component({
  selector: 'app-example',
  standalone: true,
  template: `
    <div>
      @if (loading) {
        <p>Loading prayer times...</p>
      }
      
      @if (error) {
        <p>Error: {{ error }}</p>
      }
      
      @if (prayerTimes) {
        <div>
          <h2>{{ prayerTimes.date }}</h2>
          <ul>
            <li>Fajr: {{ prayerTimes.timings.fajr }}</li>
            <li>Dhuhr: {{ prayerTimes.timings.dhuhr }}</li>
            <li>Asr: {{ prayerTimes.timings.asr }}</li>
            <li>Maghrib: {{ prayerTimes.timings.maghrib }}</li>
            <li>Isha: {{ prayerTimes.timings.isha }}</li>
          </ul>
        </div>
      }
    </div>
  `
})
export class ExampleComponent {
  private prayerTimeService = inject(PrayerTimeService);
  
  loading = false;
  error: string | null = null;
  prayerTimes: PrayerTimeData | null = null;

  ngOnInit(): void {
    this.loadPrayerTimes();
  }

  loadPrayerTimes(): void {
    this.loading = true;
    this.error = null;

    this.prayerTimeService.getTodayPrayerTimes().subscribe({
      next: (data: PrayerTimeData) => {
        this.prayerTimes = data;
        this.loading = false;
      },
      error: (error: Error) => {
        this.error = error.message;
        this.loading = false;
      }
    });
  }

  // Alternative: Get prayer times for specific coordinates
  loadPrayerTimesByLocation(): void {
    this.loading = true;
    this.error = null;

    this.prayerTimeService.getCurrentLocation().subscribe({
      next: (location) => {
        this.prayerTimeService.getPrayerTimesByCoordinates(
          location.latitude,
          location.longitude
        ).subscribe({
          next: (data: PrayerTimeData) => {
            this.prayerTimes = data;
            this.loading = false;
          },
          error: (error: Error) => {
            this.error = error.message;
            this.loading = false;
          }
        });
      },
      error: (error: Error) => {
        this.error = error.message;
        this.loading = false;
      }
    });
  }
}

