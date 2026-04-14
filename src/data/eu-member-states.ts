/**
 * EU/EEA Member States for EU ETS Maritime Compliance
 * 
 * Countries whose ports trigger EU ETS carbon taxation.
 * Source: EU ETS Maritime Regulation 2024
 */

// EU Member States (27 countries)
export const EU_MEMBER_STATES = [
  "AT", // Austria
  "BE", // Belgium
  "BG", // Bulgaria
  "HR", // Croatia
  "CY", // Cyprus
  "CZ", // Czech Republic
  "DK", // Denmark
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "HU", // Hungary
  "IE", // Ireland
  "IT", // Italy
  "LV", // Latvia
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "NL", // Netherlands
  "PL", // Poland
  "PT", // Portugal
  "RO", // Romania
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  "SE", // Sweden
] as const;

// EEA States included in EU ETS for maritime (Norway, Iceland)
export const EEA_ETS_STATES = [
  ...EU_MEMBER_STATES,
  "NO", // Norway
  "IS", // Iceland
] as const;

export type EUMemberState = typeof EU_MEMBER_STATES[number];
export type EEAETSState = typeof EEA_ETS_STATES[number];

/**
 * Check if a country code is in the EU ETS zone
 */
export function isEUETSCountry(countryCode: string): boolean {
  return EEA_ETS_STATES.includes(countryCode.toUpperCase() as EEAETSState);
}
