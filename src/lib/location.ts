import {
  CalculateRouteCommand,
  LocationClient,
  SearchPlaceIndexForPositionCommand,
  SearchPlaceIndexForTextCommand,
} from '@aws-sdk/client-location'
import { withAPIKey } from '@aws/amazon-location-utilities-auth-helper'

/** [longitude, latitude], the order MapLibre, GeoJSON and Amazon Location all use. */
export type LngLat = [number, number]
export type Place = { label: string; position: LngLat }
export type Route = { line: LngLat[]; km: number; minutes: number }

// Written to .env.local by `npm run geo:env`.
const region = import.meta.env.VITE_LOCATION_REGION as string | undefined
const apiKey = import.meta.env.VITE_LOCATION_API_KEY as string | undefined
const mapName = import.meta.env.VITE_LOCATION_MAP as string | undefined
const placeIndex = import.meta.env.VITE_LOCATION_PLACE_INDEX as string | undefined
const routeCalculator = import.meta.env.VITE_LOCATION_ROUTE_CALCULATOR as
  | string
  | undefined

export const isLocationConfigured = Boolean(
  region && apiKey && mapName && placeIndex && routeCalculator,
)

let client: LocationClient | undefined
function getClient() {
  if (!isLocationConfigured) {
    throw new Error('Amazon Location is not configured; run `npm run geo:env`')
  }
  client ??= new LocationClient({
    region,
    ...withAPIKey(apiKey!, region).getLocationClientConfig(),
  })
  return client
}

export const mapStyleUrl = () =>
  `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor?key=${apiKey}`

/** Place suggestions for what the user has typed so far, India only. */
export async function searchPlaces(
  text: string,
  bias?: LngLat,
  signal?: AbortSignal,
): Promise<Place[]> {
  const { Results } = await getClient().send(
    new SearchPlaceIndexForTextCommand({
      IndexName: placeIndex,
      Text: text,
      MaxResults: 5,
      FilterCountries: ['IND'],
      BiasPosition: bias,
    }),
    { abortSignal: signal },
  )
  return (Results ?? []).flatMap((r) => {
    const point = r.Place?.Geometry?.Point
    return point && r.Place?.Label
      ? [{ label: r.Place.Label, position: [point[0], point[1]] as LngLat }]
      : []
  })
}

/** Address for a point, e.g. the user's current location. */
export async function placeAt(position: LngLat): Promise<Place | null> {
  const { Results } = await getClient().send(
    new SearchPlaceIndexForPositionCommand({
      IndexName: placeIndex,
      Position: position,
      MaxResults: 1,
    }),
  )
  const label = Results?.[0]?.Place?.Label
  return label ? { label, position } : null
}

/**
 * Driving route between two points: the line to draw, distance in km and duration in minutes.
 * `via` adds stops in order, which is how a pickup detour can be measured.
 */
export async function calculateRoute(
  from: LngLat,
  to: LngLat,
  options: { via?: LngLat[]; departAt?: Date } = {},
): Promise<Route> {
  const { Legs, Summary } = await getClient().send(
    new CalculateRouteCommand({
      CalculatorName: routeCalculator,
      DeparturePosition: from,
      DestinationPosition: to,
      WaypointPositions: options.via,
      DepartureTime: options.departAt,
      TravelMode: 'Car',
      DistanceUnit: 'Kilometers',
      IncludeLegGeometry: true,
    }),
  )
  const line = (Legs ?? []).flatMap((leg) =>
    (leg.Geometry?.LineString ?? []).map((p) => [p[0], p[1]] as LngLat),
  )
  return {
    line,
    km: Summary?.Distance ?? 0,
    minutes: Math.round((Summary?.DurationSeconds ?? 0) / 60),
  }
}
