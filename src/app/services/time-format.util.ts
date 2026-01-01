import { TimeFormat } from './settings.service';

/**
 * Convert 24-hour time string (HH:MM) to 12-hour format (h:MM AM/PM)
 * @param time24 - Time string in 24-hour format (e.g., "14:30")
 * @returns Time string in 12-hour format (e.g., "2:30 PM")
 */
export function convertTo12Hour(time24: string): string {
  if (!time24 || !time24.includes(':')) {
    return time24; // Return as-is if invalid format
  }

  const [hours, minutes] = time24.split(':').map(Number);
  
  if (isNaN(hours) || isNaN(minutes)) {
    return time24; // Return as-is if invalid numbers
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Format time based on user preference
 * @param time24 - Time string in 24-hour format (e.g., "14:30")
 * @param format - Time format preference
 * @returns Formatted time string
 */
export function formatTime(time24: string, format: TimeFormat): string {
  if (format === TimeFormat.TWELVE_HOUR) {
    return convertTo12Hour(time24);
  }
  return time24; // Return 24-hour format as-is
}

