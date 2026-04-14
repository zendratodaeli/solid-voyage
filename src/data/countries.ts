/**
 * Country Data for Port Country Selection
 * 
 * Comprehensive list of maritime-relevant countries with:
 * - ISO 3166-1 alpha-2 codes
 * - Flag emoji
 * - Full name
 * - EU ETS membership status
 */

export interface Country {
  code: string;    // ISO 3166-1 alpha-2
  name: string;    // Full country name
  flag: string;    // Flag emoji
  euEts: boolean;  // Is this country in EU/EEA ETS zone?
}

export const COUNTRIES: Country[] = [
  // ─── EU/EEA Member States (EU ETS applicable) ───────────────
  { code: "AT", name: "Austria", flag: "🇦🇹", euEts: true },
  { code: "BE", name: "Belgium", flag: "🇧🇪", euEts: true },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬", euEts: true },
  { code: "HR", name: "Croatia", flag: "🇭🇷", euEts: true },
  { code: "CY", name: "Cyprus", flag: "🇨🇾", euEts: true },
  { code: "CZ", name: "Czech Republic", flag: "🇨🇿", euEts: true },
  { code: "DK", name: "Denmark", flag: "🇩🇰", euEts: true },
  { code: "EE", name: "Estonia", flag: "🇪🇪", euEts: true },
  { code: "FI", name: "Finland", flag: "🇫🇮", euEts: true },
  { code: "FR", name: "France", flag: "🇫🇷", euEts: true },
  { code: "DE", name: "Germany", flag: "🇩🇪", euEts: true },
  { code: "GR", name: "Greece", flag: "🇬🇷", euEts: true },
  { code: "HU", name: "Hungary", flag: "🇭🇺", euEts: true },
  { code: "IE", name: "Ireland", flag: "🇮🇪", euEts: true },
  { code: "IT", name: "Italy", flag: "🇮🇹", euEts: true },
  { code: "IS", name: "Iceland", flag: "🇮🇸", euEts: true },
  { code: "LV", name: "Latvia", flag: "🇱🇻", euEts: true },
  { code: "LT", name: "Lithuania", flag: "🇱🇹", euEts: true },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺", euEts: true },
  { code: "MT", name: "Malta", flag: "🇲🇹", euEts: true },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", euEts: true },
  { code: "NO", name: "Norway", flag: "🇳🇴", euEts: true },
  { code: "PL", name: "Poland", flag: "🇵🇱", euEts: true },
  { code: "PT", name: "Portugal", flag: "🇵🇹", euEts: true },
  { code: "RO", name: "Romania", flag: "🇷🇴", euEts: true },
  { code: "SK", name: "Slovakia", flag: "🇸🇰", euEts: true },
  { code: "SI", name: "Slovenia", flag: "🇸🇮", euEts: true },
  { code: "ES", name: "Spain", flag: "🇪🇸", euEts: true },
  { code: "SE", name: "Sweden", flag: "🇸🇪", euEts: true },

  // ─── Major Maritime Nations (Non-EU ETS) ─────────────────────
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", euEts: false },
  { code: "AL", name: "Albania", flag: "🇦🇱", euEts: false },
  { code: "AO", name: "Angola", flag: "🇦🇴", euEts: false },
  { code: "AR", name: "Argentina", flag: "🇦🇷", euEts: false },
  { code: "AU", name: "Australia", flag: "🇦🇺", euEts: false },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩", euEts: false },
  { code: "BH", name: "Bahrain", flag: "🇧🇭", euEts: false },
  { code: "BR", name: "Brazil", flag: "🇧🇷", euEts: false },
  { code: "BS", name: "Bahamas", flag: "🇧🇸", euEts: false },
  { code: "CA", name: "Canada", flag: "🇨🇦", euEts: false },
  { code: "CL", name: "Chile", flag: "🇨🇱", euEts: false },
  { code: "CN", name: "China", flag: "🇨🇳", euEts: false },
  { code: "CO", name: "Colombia", flag: "🇨🇴", euEts: false },
  { code: "CU", name: "Cuba", flag: "🇨🇺", euEts: false },
  { code: "DJ", name: "Djibouti", flag: "🇩🇯", euEts: false },
  { code: "DZ", name: "Algeria", flag: "🇩🇿", euEts: false },
  { code: "EC", name: "Ecuador", flag: "🇪🇨", euEts: false },
  { code: "EG", name: "Egypt", flag: "🇪🇬", euEts: false },
  { code: "GH", name: "Ghana", flag: "🇬🇭", euEts: false },
  { code: "GI", name: "Gibraltar", flag: "🇬🇮", euEts: false },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰", euEts: false },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", euEts: false },
  { code: "IL", name: "Israel", flag: "🇮🇱", euEts: false },
  { code: "IN", name: "India", flag: "🇮🇳", euEts: false },
  { code: "IQ", name: "Iraq", flag: "🇮🇶", euEts: false },
  { code: "IR", name: "Iran", flag: "🇮🇷", euEts: false },
  { code: "JM", name: "Jamaica", flag: "🇯🇲", euEts: false },
  { code: "JO", name: "Jordan", flag: "🇯🇴", euEts: false },
  { code: "JP", name: "Japan", flag: "🇯🇵", euEts: false },
  { code: "KE", name: "Kenya", flag: "🇰🇪", euEts: false },
  { code: "KR", name: "South Korea", flag: "🇰🇷", euEts: false },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", euEts: false },
  { code: "LB", name: "Lebanon", flag: "🇱🇧", euEts: false },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰", euEts: false },
  { code: "LR", name: "Liberia", flag: "🇱🇷", euEts: false },
  { code: "LY", name: "Libya", flag: "🇱🇾", euEts: false },
  { code: "MA", name: "Morocco", flag: "🇲🇦", euEts: false },
  { code: "MH", name: "Marshall Islands", flag: "🇲🇭", euEts: false },
  { code: "MM", name: "Myanmar", flag: "🇲🇲", euEts: false },
  { code: "MN", name: "Mongolia", flag: "🇲🇳", euEts: false },
  { code: "MO", name: "Macau", flag: "🇲🇴", euEts: false },
  { code: "MU", name: "Mauritius", flag: "🇲🇺", euEts: false },
  { code: "MX", name: "Mexico", flag: "🇲🇽", euEts: false },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", euEts: false },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿", euEts: false },
  { code: "NA", name: "Namibia", flag: "🇳🇦", euEts: false },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", euEts: false },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", euEts: false },
  { code: "OM", name: "Oman", flag: "🇴🇲", euEts: false },
  { code: "PA", name: "Panama", flag: "🇵🇦", euEts: false },
  { code: "PE", name: "Peru", flag: "🇵🇪", euEts: false },
  { code: "PG", name: "Papua New Guinea", flag: "🇵🇬", euEts: false },
  { code: "PH", name: "Philippines", flag: "🇵🇭", euEts: false },
  { code: "PK", name: "Pakistan", flag: "🇵🇰", euEts: false },
  { code: "QA", name: "Qatar", flag: "🇶🇦", euEts: false },
  { code: "RU", name: "Russia", flag: "🇷🇺", euEts: false },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", euEts: false },
  { code: "SD", name: "Sudan", flag: "🇸🇩", euEts: false },
  { code: "SG", name: "Singapore", flag: "🇸🇬", euEts: false },
  { code: "SO", name: "Somalia", flag: "🇸🇴", euEts: false },
  { code: "TH", name: "Thailand", flag: "🇹🇭", euEts: false },
  { code: "TN", name: "Tunisia", flag: "🇹🇳", euEts: false },
  { code: "TR", name: "Turkey", flag: "🇹🇷", euEts: false },
  { code: "TW", name: "Taiwan", flag: "🇹🇼", euEts: false },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", euEts: false },
  { code: "UA", name: "Ukraine", flag: "🇺🇦", euEts: false },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", euEts: false },
  { code: "US", name: "United States", flag: "🇺🇸", euEts: false },
  { code: "UY", name: "Uruguay", flag: "🇺🇾", euEts: false },
  { code: "VE", name: "Venezuela", flag: "🇻🇪", euEts: false },
  { code: "VN", name: "Vietnam", flag: "🇻🇳", euEts: false },
  { code: "YE", name: "Yemen", flag: "🇾🇪", euEts: false },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", euEts: false },
];

/** Lookup country by code */
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code.toUpperCase());
}

/** Lookup country code by name (case-insensitive) */
export function getCountryCodeByName(name: string): string | undefined {
  const lower = name.toLowerCase().trim();
  return COUNTRIES.find(c => c.name.toLowerCase() === lower)?.code;
}

/** Check if a country code is in the EU ETS zone */
export function isCountryEuEts(code: string): boolean {
  const c = getCountryByCode(code);
  return c?.euEts ?? false;
}
