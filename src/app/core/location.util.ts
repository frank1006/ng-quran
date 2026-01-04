/**
 * Utility functions for location and geocoding operations
 */

/**
 * Nominatim API address response interface
 */
export interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
}

/**
 * Normalizes address data from Nominatim API to extract quadrant
 * Priority order: suburb > neighbourhood > city > state
 * 
 * @param address - Address object from Nominatim API response
 * @returns Normalized quadrant string
 */
export function normalizeQuadrant(address: NominatimAddress | null | undefined): string {
  if (!address) {
    return '';
  }

  // Priority order: suburb > neighbourhood > city > state
  return (
    address.suburb ||
    address.neighbourhood ||
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.state ||
    ''
  );
}

/**
 * Normalizes city name from address data
 * Falls back through multiple address fields
 * 
 * @param address - Address object from Nominatim API response
 * @returns Normalized city string
 */
export function normalizeCity(address: NominatimAddress | null | undefined): string {
  if (!address) {
    return 'Unknown Location';
  }

  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.state ||
    'Unknown Location'
  );
}

/**
 * Normalizes country name from address data
 * 
 * @param address - Address object from Nominatim API response
 * @returns Normalized country string
 */
export function normalizeCountry(address: NominatimAddress | null | undefined): string {
  if (!address) {
    return 'Unknown Country';
  }

  return address.country || 'Unknown Country';
}

