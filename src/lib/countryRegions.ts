export const REGIONS = [
  'North America',
  'Latin America',
  'Europe',
  'Asia-Pacific',
  'Middle East & Africa',
] as const;

export type Region = (typeof REGIONS)[number] | 'Unknown';

const REGION_MEMBERS: Record<(typeof REGIONS)[number], string[]> = {
  'North America': ['US', 'CA', 'BM', 'GL', 'PM'],
  'Latin America': [
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'GY', 'SR', 'GF',
    'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'BZ', 'CU', 'DO', 'HT', 'JM', 'PR', 'TT', 'BS',
    'BB', 'GD', 'LC', 'VC', 'AG', 'KN', 'DM', 'AW', 'CW', 'SX', 'TC', 'KY', 'VG', 'VI',
    'AI', 'MS', 'BQ', 'MF', 'BL', 'GP', 'MQ', 'FK', 'BV', 'GS',
  ],
  Europe: [
    'GB', 'IE', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'LU', 'CH', 'AT', 'DK', 'SE',
    'NO', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'RS', 'BA',
    'ME', 'MK', 'AL', 'XK', 'EE', 'LV', 'LT', 'BY', 'UA', 'MD', 'RU', 'MT', 'CY', 'AD',
    'MC', 'SM', 'VA', 'LI', 'FO', 'GI', 'IM', 'JE', 'GG', 'AX', 'SJ',
  ],
  'Asia-Pacific': [
    'CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'KP', 'MN', 'SG', 'MY', 'ID', 'TH', 'VN', 'PH',
    'KH', 'LA', 'MM', 'BN', 'TL', 'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
    'AU', 'NZ', 'CC', 'CX', 'HM', 'FJ', 'PG', 'SB', 'VU', 'NC', 'PF', 'WS', 'TO', 'KI',
    'FM', 'MH', 'PW', 'NR', 'TV', 'CK', 'NU', 'AS', 'GU', 'MP', 'UM', 'WF', 'TK', 'NF', 'PN',
    'KZ', 'UZ', 'TM', 'KG', 'TJ',
  ],
  'Middle East & Africa': [
    'IL', 'PS', 'TR', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'JO', 'LB', 'SY', 'IQ',
    'IR', 'GE', 'AM', 'AZ',
    'EG', 'LY', 'TN', 'DZ', 'MA', 'MR', 'EH', 'SD', 'SS', 'ET', 'ER', 'DJ', 'SO', 'KE', 'UG',
    'TZ', 'RW', 'BI', 'NG', 'GH', 'CI', 'SN', 'ML', 'BF', 'NE', 'TD', 'CM', 'CF', 'GA',
    'CG', 'CD', 'AO', 'ZM', 'ZW', 'MW', 'MZ', 'BW', 'NA', 'ZA', 'LS', 'SZ', 'MG', 'MU',
    'SC', 'KM', 'CV', 'GM', 'GN', 'GW', 'LR', 'SL', 'TG', 'BJ', 'ST', 'GQ', 'RE', 'YT',
    'IO', 'SH', 'TF',
  ],
};

export const REGION_COLORS: Record<Region, string> = {
  'North America': '#2980EF',
  'Latin America': '#3FA129',
  Europe: '#FF8000',
  'Asia-Pacific': '#E62829',
  'Middle East & Africa': '#9040CC',

  Unknown: '#9FA19F',
};

const LOOKUP = new Map<string, Region>();
for (const region of REGIONS) {
  for (const code of REGION_MEMBERS[region]) LOOKUP.set(code, region);
}

export function regionOf(country?: string): Region {
  if (!country) return 'Unknown';
  return LOOKUP.get(country.toUpperCase()) ?? 'Unknown';
}
