import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { PlaceAutocomplete } from "./components/PlaceAutocomplete";
import { RouteMap as GeoMap, type MapMarker } from "./components/RouteMap";
import {
  calculateRoute,
  isLocationConfigured,
  type LngLat,
  type Place,
  type Route,
} from "./lib/location";
import { publishCloud, requestCloud, searchCloud } from "./cloud";
import { money } from "./domain";
import type { Profile, Trip } from "./domain";

// Signed-in (non-demo) screens for posting a trip, searching and requesting a
// seat, plus the real map for a trip. Demo mode keeps its own screens in App.tsx.

const CITY_CENTRE: Record<string, LngLat> = {
  Delhi: [77.209, 28.6139],
  Bengaluru: [77.5946, 12.9716],
  Mumbai: [72.8777, 19.076],
};
const START_COLOR = "#28724c";
const END_COLOR = "#e8ab53";

/** Value for a datetime-local input, in the browser's time zone. */
function localInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

/** Trip.routeLine is JSON: accept the array or a (possibly twice) stringified one. */
function parseRouteLine(value: unknown): LngLat[] {
  let parsed = value;
  try {
    for (let i = 0; i < 2 && typeof parsed === "string"; i++)
      parsed = JSON.parse(parsed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (p): p is LngLat =>
      Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
}

function Heading(props: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{props.eyebrow}</span>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
    </div>
  );
}

function MapsMissing() {
  return (
    <p className="notice">
      Maps are not configured in this build. Add the five VITE_LOCATION_* values
      (from Ashwin) to .env.local or the Hosting environment, then rebuild.
    </p>
  );
}

/** Real map for one trip: its route, start and end, and the driver's live position. */
export function TripMap({ trip }: { trip: Trip }) {
  const { routeLine, startLat, startLng, endLat, endLng } = trip;
  const route = useMemo(() => parseRouteLine(routeLine), [routeLine]);
  const markers = useMemo<MapMarker[]>(
    () => [
      { position: [startLng, startLat], label: trip.startLabel, color: START_COLOR },
      { position: [endLng, endLat], label: trip.endLabel, color: END_COLOR },
    ],
    [startLat, startLng, endLat, endLng, trip.startLabel, trip.endLabel],
  );
  const vehicle = useMemo<LngLat | null>(
    () =>
      trip.status === "ACTIVE" && trip.lastLat != null && trip.lastLng != null
        ? [trip.lastLng, trip.lastLat]
        : null,
    [trip.status, trip.lastLat, trip.lastLng],
  );
  return <GeoMap route={route} markers={markers} vehicle={vehicle} />;
}

export function OfferCloud({
  profile,
  onProfile,
  onPublished,
}: {
  profile?: Profile;
  onProfile: () => void;
  onPublished: (tripId: string, shareRupees: number) => void;
}) {
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [seats, setSeats] = useState(profile?.seats || 3);
  const [departure, setDeparture] = useState(() =>
    localInput(new Date(Date.now() + 30 * 60000)),
  );
  const [minimumDeparture] = useState(() => localInput(new Date()));
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Recalculate the driving route whenever both ends are chosen.
  useEffect(() => {
    if (!start || !end) return;
    let cancelled = false;
    void (async () => {
      setRouting(true);
      setError("");
      try {
        const found = await calculateRoute(start.position, end.position);
        if (cancelled) return;
        if (found.line.length < 2) throw Error("No driving route found between these places.");
        setRoute(found);
      } catch (e) {
        if (!cancelled) {
          setRoute(null);
          setError(errorText(e, "Could not calculate the route."));
        }
      } finally {
        if (!cancelled) setRouting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const shownRoute = start && end ? route : null;
  const line = useMemo(() => shownRoute?.line ?? [], [shownRoute]);
  const markers = useMemo<MapMarker[]>(
    () => [
      ...(start ? [{ position: start.position, label: start.label, color: START_COLOR }] : []),
      ...(end ? [{ position: end.position, label: end.label, color: END_COLOR }] : []),
    ],
    [start, end],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !start || !end || !shownRoute) return;
    if (new Date(departure).getTime() <= Date.now()) {
      setError("Choose a departure time in the future.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const published = await publishCloud(
        {
          id: "",
          driverId: profile.userId,
          city: profile.city,
          startLabel: start.label,
          endLabel: end.label,
          startLat: start.position[1],
          startLng: start.position[0],
          endLat: end.position[1],
          endLng: end.position[0],
          departAt: new Date(departure).toISOString(),
          seatsTotal: seats,
          seatsLeft: seats,
          routeKm: Math.round(shownRoute.km * 10) / 10,
          shareRupees: 0,
          status: "DRAFT",
        },
        shownRoute.line,
      );
      onPublished(published.id, published.shareRupees ?? 0);
    } catch (e) {
      setError(errorText(e, "Could not publish the trip."));
    } finally {
      setBusy(false);
    }
  }

  const bias = CITY_CENTRE[profile?.city ?? ""];
  return (
    <>
      <Heading
        eyebrow="MAKE ROOM FOR A BETTER COMMUTE"
        title="Offer a ride"
        description="Already heading there? Bring someone along."
      />
      {!profile || profile.vehicleType === "NONE" ? (
        <div className="empty">
          <span>↗</span>
          <p>Add your vehicle to your profile before offering a ride.</p>
          <button className="secondary" onClick={onProfile}>
            Add my vehicle
          </button>
        </div>
      ) : (
        <div className="offer-grid">
          <form className="panel" onSubmit={(e) => void submit(e)}>
            {!isLocationConfigured && <MapsMissing />}
            <div className="field">
              <PlaceAutocomplete
                label="Start"
                value={start}
                onSelect={setStart}
                bias={bias}
                placeholder="Search for your start point"
              />
            </div>
            <div className="field">
              <PlaceAutocomplete
                label="Destination"
                value={end}
                onSelect={setEnd}
                bias={bias}
                placeholder="Search for your destination"
              />
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Departure</span>
                <input
                  type="datetime-local"
                  required
                  min={minimumDeparture}
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Passenger seats</span>
                <input
                  type="number"
                  required
                  min="1"
                  max={profile.seats}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="fuel-share">
              <span>Driving route</span>
              <b>
                {routing
                  ? "…"
                  : shownRoute
                    ? `${shownRoute.km.toFixed(1)} km · ${shownRoute.minutes} min`
                    : "—"}
              </b>
            </div>
            {error && (
              <p className="notice" role="status">
                {error}
              </p>
            )}
            <p className="fine">
              The fuel share per rider is calculated when you publish, from your
              vehicle's fuel and mileage, split across {seats + 1} people.
            </p>
            <button className="primary" disabled={busy || routing || !shownRoute}>
              {busy ? "Publishing…" : "Publish trip →"}
            </button>
          </form>
          <GeoMap route={line} markers={markers} />
        </div>
      )}
    </>
  );
}

type Matches = Awaited<ReturnType<typeof searchCloud>>;
type Match = NonNullable<NonNullable<Matches>[number]>;

export function FindCloud({
  profile,
  requestedTripIds,
  onRequested,
}: {
  profile?: Profile;
  /** Trips the rider already has a live request on. */
  requestedTripIds: string[];
  onRequested: (tripId: string) => void;
}) {
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [time, setTime] = useState(() =>
    localInput(new Date(Date.now() + 30 * 60000)),
  );
  const [results, setResults] = useState<Match[] | null>(null);
  const [shownId, setShownId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!pickup || !drop) {
      setError("Choose a pickup and a destination from the suggestions.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const found = await searchCloud({
        pickupLat: pickup.position[1],
        pickupLng: pickup.position[0],
        dropLat: drop.position[1],
        dropLng: drop.position[0],
        departAt: new Date(time).toISOString(),
      });
      const matches = (found ?? []).filter((m): m is Match => !!m?.trip);
      setResults(matches);
      setShownId(matches[0]?.trip?.id ?? "");
    } catch (e) {
      setError(errorText(e, "Search failed."));
    } finally {
      setBusy(false);
    }
  }

  async function request(match: Match) {
    if (!pickup || !drop || !match.trip) return;
    const tripId = match.trip.id;
    setBusy(true);
    setError("");
    try {
      await requestCloud({ id: tripId } as Trip, {
        pickupLat: pickup.position[1],
        pickupLng: pickup.position[0],
        pickupLabel: pickup.label,
        dropLat: drop.position[1],
        dropLng: drop.position[0],
        dropLabel: drop.label,
        sharedKm: match.sharedKm ?? 0,
      });
      onRequested(tripId);
    } catch (e) {
      setError(errorText(e, "Could not request the seat."));
    } finally {
      setBusy(false);
    }
  }

  const shown = results?.find((m) => m.trip?.id === shownId);
  const line = useMemo(() => parseRouteLine(shown?.trip?.routeLine), [shown]);
  const markers = useMemo<MapMarker[]>(
    () => [
      ...(pickup ? [{ position: pickup.position, label: "Your pickup", color: START_COLOR }] : []),
      ...(drop ? [{ position: drop.position, label: "Your drop", color: END_COLOR }] : []),
    ],
    [pickup, drop],
  );
  const bias = CITY_CENTRE[profile?.city ?? ""];

  return (
    <>
      <Heading
        eyebrow="GOING YOUR WAY"
        title="Find your next ride"
        description="A shared seat. A familiar face. A greener journey."
      />
      {!isLocationConfigured && <MapsMissing />}
      <form className="search-bar" onSubmit={(e) => void search(e)}>
        <PlaceAutocomplete
          label="Pickup"
          value={pickup}
          onSelect={setPickup}
          bias={bias}
          placeholder="Where should the driver pick you up?"
        />
        <PlaceAutocomplete
          label="Destination"
          value={drop}
          onSelect={setDrop}
          bias={bias}
          placeholder="Where are you going?"
        />
        <label className="field">
          <span>Departure time</span>
          <input
            type="datetime-local"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Searching…" : "Search rides ↗"}
        </button>
      </form>
      <p className="fine">
        Rides from your organisation whose route passes within 1 km of both
        points, leaving within 30 minutes of your time. Nearest pickup first.
      </p>
      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}
      {results && (
        <>
          <div className="section-title">
            <h2>
              {results.length} available {results.length === 1 ? "ride" : "rides"}
            </h2>
            <span className="muted">Your organisation</span>
          </div>
          <div className="trip-grid">
            {results.map((match) => {
              const trip = match.trip!;
              const requested = requestedTripIds.includes(trip.id);
              return (
                <article
                  className="trip-card"
                  key={trip.id}
                  onMouseEnter={() => setShownId(trip.id)}
                >
                  <div className="trip-person">
                    <span className="avatar">{match.driverName?.slice(0, 1) || "D"}</span>
                    <div>
                      <b>{match.driverName || "Community driver"}</b>
                      <small>
                        {match.vehicleType?.toLowerCase() || "Shared commute"} ·{" "}
                        {trip.seatsLeft ?? 0} seats left
                      </small>
                    </div>
                    <span className="price">
                      {money(trip.shareRupees ?? 0)}
                      <small>/ rider</small>
                    </span>
                  </div>
                  <div className="route-text">
                    <span>
                      ● <b>{trip.startLabel}</b>
                    </span>
                    <span>⋮</span>
                    <span>
                      ○ <b>{trip.endLabel}</b>
                    </span>
                  </div>
                  <div className="trip-bottom">
                    <span>
                      {trip.departAt &&
                        new Date(trip.departAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Kolkata",
                        })}{" "}
                      IST · {(match.walkKmToPickup ?? 0).toFixed(2)} km walk ·{" "}
                      {(match.sharedKm ?? 0).toFixed(1)} km shared
                    </span>
                    <button
                      className="secondary"
                      disabled={busy || requested}
                      onClick={() => void request(match)}
                    >
                      {requested ? "Requested ✓" : "Request ride ↗"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!results.length && (
              <div className="empty">
                <span>↗</span>
                <p>No matching rides. Try a different place or departure time.</p>
              </div>
            )}
          </div>
          {results.length > 0 && <GeoMap route={line} markers={markers} />}
        </>
      )}
    </>
  );
}
