/** Major cities with their primary airport code and IANA zone. */
export interface City {
  name: string;
  country: string;
  /** Primary IATA code (used as the short label). */
  code: string;
  tz: string;
}

export const CITIES: City[] = [
  // North America
  { name: 'New York', country: 'United States', code: 'JFK', tz: 'America/New_York' },
  { name: 'Boston', country: 'United States', code: 'BOS', tz: 'America/New_York' },
  { name: 'Washington, D.C.', country: 'United States', code: 'IAD', tz: 'America/New_York' },
  { name: 'Atlanta', country: 'United States', code: 'ATL', tz: 'America/New_York' },
  { name: 'Miami', country: 'United States', code: 'MIA', tz: 'America/New_York' },
  { name: 'Chicago', country: 'United States', code: 'ORD', tz: 'America/Chicago' },
  { name: 'Dallas', country: 'United States', code: 'DFW', tz: 'America/Chicago' },
  { name: 'Houston', country: 'United States', code: 'IAH', tz: 'America/Chicago' },
  { name: 'Denver', country: 'United States', code: 'DEN', tz: 'America/Denver' },
  { name: 'Phoenix', country: 'United States', code: 'PHX', tz: 'America/Phoenix' },
  { name: 'Los Angeles', country: 'United States', code: 'LAX', tz: 'America/Los_Angeles' },
  { name: 'San Francisco', country: 'United States', code: 'SFO', tz: 'America/Los_Angeles' },
  { name: 'Seattle', country: 'United States', code: 'SEA', tz: 'America/Los_Angeles' },
  { name: 'Las Vegas', country: 'United States', code: 'LAS', tz: 'America/Los_Angeles' },
  { name: 'Anchorage', country: 'United States', code: 'ANC', tz: 'America/Anchorage' },
  { name: 'Honolulu', country: 'United States', code: 'HNL', tz: 'Pacific/Honolulu' },
  { name: 'Toronto', country: 'Canada', code: 'YYZ', tz: 'America/Toronto' },
  { name: 'Montreal', country: 'Canada', code: 'YUL', tz: 'America/Toronto' },
  { name: 'Vancouver', country: 'Canada', code: 'YVR', tz: 'America/Vancouver' },
  { name: 'Calgary', country: 'Canada', code: 'YYC', tz: 'America/Edmonton' },
  { name: 'Halifax', country: 'Canada', code: 'YHZ', tz: 'America/Halifax' },
  { name: 'Mexico City', country: 'Mexico', code: 'MEX', tz: 'America/Mexico_City' },
  { name: 'Cancún', country: 'Mexico', code: 'CUN', tz: 'America/Cancun' },
  // Latin America
  { name: 'Panama City', country: 'Panama', code: 'PTY', tz: 'America/Panama' },
  { name: 'Bogotá', country: 'Colombia', code: 'BOG', tz: 'America/Bogota' },
  { name: 'Lima', country: 'Peru', code: 'LIM', tz: 'America/Lima' },
  { name: 'Santiago', country: 'Chile', code: 'SCL', tz: 'America/Santiago' },
  { name: 'Buenos Aires', country: 'Argentina', code: 'EZE', tz: 'America/Argentina/Buenos_Aires' },
  { name: 'São Paulo', country: 'Brazil', code: 'GRU', tz: 'America/Sao_Paulo' },
  { name: 'Rio de Janeiro', country: 'Brazil', code: 'GIG', tz: 'America/Sao_Paulo' },
  // Europe
  { name: 'London', country: 'United Kingdom', code: 'LHR', tz: 'Europe/London' },
  { name: 'Dublin', country: 'Ireland', code: 'DUB', tz: 'Europe/Dublin' },
  { name: 'Lisbon', country: 'Portugal', code: 'LIS', tz: 'Europe/Lisbon' },
  { name: 'Madrid', country: 'Spain', code: 'MAD', tz: 'Europe/Madrid' },
  { name: 'Barcelona', country: 'Spain', code: 'BCN', tz: 'Europe/Madrid' },
  { name: 'Paris', country: 'France', code: 'CDG', tz: 'Europe/Paris' },
  { name: 'Amsterdam', country: 'Netherlands', code: 'AMS', tz: 'Europe/Amsterdam' },
  { name: 'Brussels', country: 'Belgium', code: 'BRU', tz: 'Europe/Brussels' },
  { name: 'Frankfurt', country: 'Germany', code: 'FRA', tz: 'Europe/Berlin' },
  { name: 'Berlin', country: 'Germany', code: 'BER', tz: 'Europe/Berlin' },
  { name: 'Munich', country: 'Germany', code: 'MUC', tz: 'Europe/Berlin' },
  { name: 'Zurich', country: 'Switzerland', code: 'ZRH', tz: 'Europe/Zurich' },
  { name: 'Vienna', country: 'Austria', code: 'VIE', tz: 'Europe/Vienna' },
  { name: 'Rome', country: 'Italy', code: 'FCO', tz: 'Europe/Rome' },
  { name: 'Milan', country: 'Italy', code: 'MXP', tz: 'Europe/Rome' },
  { name: 'Copenhagen', country: 'Denmark', code: 'CPH', tz: 'Europe/Copenhagen' },
  { name: 'Stockholm', country: 'Sweden', code: 'ARN', tz: 'Europe/Stockholm' },
  { name: 'Oslo', country: 'Norway', code: 'OSL', tz: 'Europe/Oslo' },
  { name: 'Helsinki', country: 'Finland', code: 'HEL', tz: 'Europe/Helsinki' },
  { name: 'Reykjavík', country: 'Iceland', code: 'KEF', tz: 'Atlantic/Reykjavik' },
  { name: 'Warsaw', country: 'Poland', code: 'WAW', tz: 'Europe/Warsaw' },
  { name: 'Prague', country: 'Czechia', code: 'PRG', tz: 'Europe/Prague' },
  { name: 'Athens', country: 'Greece', code: 'ATH', tz: 'Europe/Athens' },
  { name: 'Istanbul', country: 'Türkiye', code: 'IST', tz: 'Europe/Istanbul' },
  { name: 'Moscow', country: 'Russia', code: 'SVO', tz: 'Europe/Moscow' },
  // Middle East & Africa
  { name: 'Dubai', country: 'United Arab Emirates', code: 'DXB', tz: 'Asia/Dubai' },
  { name: 'Abu Dhabi', country: 'United Arab Emirates', code: 'AUH', tz: 'Asia/Dubai' },
  { name: 'Doha', country: 'Qatar', code: 'DOH', tz: 'Asia/Qatar' },
  { name: 'Riyadh', country: 'Saudi Arabia', code: 'RUH', tz: 'Asia/Riyadh' },
  { name: 'Tel Aviv', country: 'Israel', code: 'TLV', tz: 'Asia/Jerusalem' },
  { name: 'Cairo', country: 'Egypt', code: 'CAI', tz: 'Africa/Cairo' },
  { name: 'Casablanca', country: 'Morocco', code: 'CMN', tz: 'Africa/Casablanca' },
  { name: 'Lagos', country: 'Nigeria', code: 'LOS', tz: 'Africa/Lagos' },
  { name: 'Nairobi', country: 'Kenya', code: 'NBO', tz: 'Africa/Nairobi' },
  { name: 'Addis Ababa', country: 'Ethiopia', code: 'ADD', tz: 'Africa/Addis_Ababa' },
  { name: 'Johannesburg', country: 'South Africa', code: 'JNB', tz: 'Africa/Johannesburg' },
  { name: 'Cape Town', country: 'South Africa', code: 'CPT', tz: 'Africa/Johannesburg' },
  // Asia
  { name: 'Delhi', country: 'India', code: 'DEL', tz: 'Asia/Kolkata' },
  { name: 'Mumbai', country: 'India', code: 'BOM', tz: 'Asia/Kolkata' },
  { name: 'Bengaluru', country: 'India', code: 'BLR', tz: 'Asia/Kolkata' },
  { name: 'Kathmandu', country: 'Nepal', code: 'KTM', tz: 'Asia/Kathmandu' },
  { name: 'Colombo', country: 'Sri Lanka', code: 'CMB', tz: 'Asia/Colombo' },
  { name: 'Bangkok', country: 'Thailand', code: 'BKK', tz: 'Asia/Bangkok' },
  { name: 'Ho Chi Minh City', country: 'Vietnam', code: 'SGN', tz: 'Asia/Ho_Chi_Minh' },
  { name: 'Kuala Lumpur', country: 'Malaysia', code: 'KUL', tz: 'Asia/Kuala_Lumpur' },
  { name: 'Singapore', country: 'Singapore', code: 'SIN', tz: 'Asia/Singapore' },
  { name: 'Jakarta', country: 'Indonesia', code: 'CGK', tz: 'Asia/Jakarta' },
  { name: 'Bali (Denpasar)', country: 'Indonesia', code: 'DPS', tz: 'Asia/Makassar' },
  { name: 'Manila', country: 'Philippines', code: 'MNL', tz: 'Asia/Manila' },
  { name: 'Hong Kong', country: 'China', code: 'HKG', tz: 'Asia/Hong_Kong' },
  { name: 'Shanghai', country: 'China', code: 'PVG', tz: 'Asia/Shanghai' },
  { name: 'Beijing', country: 'China', code: 'PEK', tz: 'Asia/Shanghai' },
  { name: 'Taipei', country: 'Taiwan', code: 'TPE', tz: 'Asia/Taipei' },
  { name: 'Seoul', country: 'South Korea', code: 'ICN', tz: 'Asia/Seoul' },
  { name: 'Tokyo', country: 'Japan', code: 'HND', tz: 'Asia/Tokyo' },
  { name: 'Osaka', country: 'Japan', code: 'KIX', tz: 'Asia/Tokyo' },
  // Oceania
  { name: 'Perth', country: 'Australia', code: 'PER', tz: 'Australia/Perth' },
  { name: 'Adelaide', country: 'Australia', code: 'ADL', tz: 'Australia/Adelaide' },
  { name: 'Brisbane', country: 'Australia', code: 'BNE', tz: 'Australia/Brisbane' },
  { name: 'Sydney', country: 'Australia', code: 'SYD', tz: 'Australia/Sydney' },
  { name: 'Melbourne', country: 'Australia', code: 'MEL', tz: 'Australia/Melbourne' },
  { name: 'Auckland', country: 'New Zealand', code: 'AKL', tz: 'Pacific/Auckland' },
  { name: 'Fiji (Nadi)', country: 'Fiji', code: 'NAN', tz: 'Pacific/Fiji' },
];

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Case/accent-insensitive search over name, country, code and zone. */
export function searchCities(query: string): City[] {
  const q = norm(query.trim());
  if (!q) return CITIES;
  const scored: { c: City; s: number }[] = [];
  for (const c of CITIES) {
    const name = norm(c.name);
    const code = norm(c.code);
    let s = -1;
    if (code === q) s = 0;
    else if (name.startsWith(q)) s = 1;
    else if (name.includes(q)) s = 2;
    else if (norm(c.country).includes(q)) s = 3;
    else if (norm(c.tz).includes(q)) s = 4;
    if (s >= 0) scored.push({ c, s });
  }
  scored.sort((a, b) => a.s - b.s || a.c.name.localeCompare(b.c.name));
  return scored.map((x) => x.c);
}

/** Display label for a place: city name when known, else the zone's last segment. */
export function labelForZone(tz: string): string {
  const last = tz.split('/').pop() ?? tz;
  return last.replace(/_/g, ' ');
}
