/** kg CO2 per vehicle-km, keyed by `${vehicleType}_${fuel}`. */
export const EMISSION_FACTORS: Record<string, number> = {
  HATCHBACK_PETROL: 0.14,
  SEDAN_PETROL: 0.153,
  SUV_PETROL: 0.166,
  HATCHBACK_DIESEL: 0.126,
  SEDAN_DIESEL: 0.141,
  SUV_DIESEL: 0.201,
  HATCHBACK_CNG: 0.068,
  SEDAN_CNG: 0.068,
  SUV_CNG: 0.068,
  SCOOTER_PETROL: 0.0368,
  MOTORCYCLE_PETROL: 0.0319,
  HATCHBACK_ELECTRIC: 0.1,
  SEDAN_ELECTRIC: 0.1,
  SUV_ELECTRIC: 0.1,
  DEFAULT: 0.14,
};

/**
 * Fuel price in rupees per unit (litre for PETROL/DIESEL, kg for CNG, kWh for
 * ELECTRIC), keyed by city then fuel.
 * TODO: placeholder numbers, replace with real prices.
 */
export const FUEL_PRICE_PER_UNIT: Record<string, Record<string, number>> = {
  Bengaluru: { PETROL: 100, DIESEL: 90, CNG: 85, ELECTRIC: 10 }, // TODO
  Delhi: { PETROL: 100, DIESEL: 90, CNG: 85, ELECTRIC: 10 }, // TODO
  Mumbai: { PETROL: 100, DIESEL: 90, CNG: 85, ELECTRIC: 10 }, // TODO
  DEFAULT: { PETROL: 100, DIESEL: 90, CNG: 85, ELECTRIC: 10 }, // TODO
};

export const DEFAULT_MILEAGE_KMPL = 15;

// TODO: indicative kg CO2/passenger-km; verify India operator-specific sources
// before enabling automatic transit approval or presenting measured savings.
export const TRANSIT_FACTORS = { METRO: 0.03, BUS: 0.05 } as const;

/**
 * Email domain -> organisation.
 * TODO: placeholder organisations, replace with real ones.
 *
 * `adminEmails` only seeds the organisation's admin list the first time the
 * organisation is created in the database. After that the list lives on the
 * Organization row and is changed with the setOrgAdmin mutation, not here.
 */
export const ORG_DOMAINS: Record<
  string,
  { orgId: string; name: string; city: string; adminEmails?: string[] }
> = {
  'example-corp.com': {
    orgId: 'org-example-corp',
    name: 'Example Corp',
    city: 'Bengaluru',
    adminEmails: ['admin@example-corp.com'], // TODO
  },
  'example-college.ac.in': {
    orgId: 'org-example-college',
    name: 'Example College',
    city: 'Delhi',
    adminEmails: ['driver@example-college.ac.in'], // TODO
  },
};
