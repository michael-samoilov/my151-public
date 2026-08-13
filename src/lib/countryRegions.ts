/**
 * ISO 3166-1 alpha-2 country code → broad region.
 *
 * Used to collapse the admin's country tally, whose long tail of one- and
 * two-user countries costs far more vertical space than it conveys. Regions are
 * market-shaped rather than strictly geographic: Mexico sits with Latin America
 * and Russia with Europe, because the grouping exists to answer "where are my
 * users, roughly" rather than to settle a cartographic argument.
 *
 * Language lives on its own tally, from Accept-Language. Country is a poor
 * proxy for it — an Italian user browsing in en-US is ordinary, not an anomaly.
 */

export const REGIONS = [
  'North America',
  'Latin America',
  'Europe',
  'Asia-Pacific',
  'Middle East & Africa',
] as const;

export type Region = (typeof REGIONS)[number] | 'Unknown';

/** The raw table. Exported so a test can check it for codes listed twice — the
 *  lookup below silently resolves those to whichever region is built last. */
export const REGION_MEMBERS: Record<(typeof REGIONS)[number], string[]> = {
  'North America': ['US', 'CA', 'BM', 'GL', 'PM'],
  'Latin America': [
    'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'GY', 'SR', 'GF',
    'CR', 'PA', 'GT', 'HN', 'SV', 'NI', 'BZ', 'CU', 'DO', 'HT', 'JM', 'PR', 'TT', 'BS',
    'BB', 'GD', 'LC', 'VC', 'AG', 'KN', 'DM', 'AW', 'CW', 'SX', 'TC', 'KY', 'VG', 'VI',
    'AI', 'MS', 'BQ', 'MF', 'BL', 'GP', 'MQ', 'FK',
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
    'AU', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'NC', 'PF', 'WS', 'TO', 'KI', 'FM', 'MH', 'PW',
    'NR', 'TV', 'CK', 'NU', 'AS', 'GU', 'MP', 'WF', 'TK', 'NF',
    'KZ', 'UZ', 'TM', 'KG', 'TJ',
  ],
  'Middle East & Africa': [
    'IL', 'PS', 'TR', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'JO', 'LB', 'SY', 'IQ',
    'IR', 'GE', 'AM', 'AZ',
    'EG', 'LY', 'TN', 'DZ', 'MA', 'EH', 'SD', 'SS', 'ET', 'ER', 'DJ', 'SO', 'KE', 'UG',
    'TZ', 'RW', 'BI', 'NG', 'GH', 'CI', 'SN', 'ML', 'BF', 'NE', 'TD', 'CM', 'CF', 'GA',
    'CG', 'CD', 'AO', 'ZM', 'ZW', 'MW', 'MZ', 'BW', 'NA', 'ZA', 'LS', 'SZ', 'MG', 'MU',
    'SC', 'KM', 'CV', 'GM', 'GN', 'GW', 'LR', 'SL', 'TG', 'BJ', 'ST', 'GQ', 'RE', 'YT',
  ],
};

/**
 * One fixed colour per region, drawn from the Gen IX type badges the app
 * already ships (`TYPE_COLORS`) so the admin charts stay in the product's own
 * palette rather than importing a second one.
 *
 * Keyed by region, never by rank: a region keeps its colour when the ordering
 * shifts, so a chart re-read after new data does not silently repaint.
 *
 * The five hues were checked as a categorical set on a light surface — every
 * pair clears the colour-vision and normal-vision separation floors. Two
 * caveats ride along, and both are discharged by the charts that use this:
 * the blue/purple pair sits in the lower colour-vision band, and the orange
 * falls under 3:1 against the card. Each region is therefore always drawn with
 * its name and count beside it, never colour alone.
 */
export const REGION_COLORS: Record<Region, string> = {
  'North America': '#2980EF', // water
  Europe: '#FF8000', // fighting
  'Asia-Pacific': '#9040CC', // poison
  'Latin America': '#915121', // ground
  'Middle East & Africa': '#EF4179', // psychic
  // A residual bucket rather than a peer category, so it stays neutral.
  Unknown: '#9FA19F', // normal
};

const LOOKUP = new Map<string, Region>();
for (const region of REGIONS) {
  for (const code of REGION_MEMBERS[region]) LOOKUP.set(code, region);
}

/** Region for a country code. Unrecognized or missing codes group as 'Unknown'
 *  rather than being dropped, so the region totals always sum to the user count. */
export function regionOf(country?: string): Region {
  if (!country) return 'Unknown';
  return LOOKUP.get(country.toUpperCase()) ?? 'Unknown';
}
