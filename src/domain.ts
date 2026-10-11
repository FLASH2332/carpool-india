export type Profile = {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  orgId?: string;
  city: string;
  vehicleType:
    "NONE" | "HATCHBACK" | "SEDAN" | "SUV" | "SCOOTER" | "MOTORCYCLE";
  fuel: "PETROL" | "DIESEL" | "CNG" | "ELECTRIC";
  mileageKmpl: number;
  seats: number;
  plate?: string;
  upiVpa?: string;
};
export type Trip = {
  id: string;
  driverId: string;
  orgId?: string;
  city: string;
  startLabel: string;
  endLabel: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  departAt: string;
  seatsLeft: number;
  seatsTotal: number;
  routeKm: number;
  shareRupees: number;
  status: "OPEN" | "ACTIVE" | "DONE" | "CANCELLED" | "DRAFT";
  lastLat?: number;
  lastLng?: number;
  lastAt?: string;
};
export type Request = {
  id: string;
  tripId: string;
  riderId: string;
  driverId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "DONE";
  pickupLabel: string;
  dropLabel: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  sharedKm: number;
};
export type Impact = {
  id: string;
  userId: string;
  tripId: string;
  month: string;
  kmShared: number;
  kgCO2: number;
  rupees: number;
  points: number;
  role: "RIDER" | "DRIVER";
};
export type Aqi = {
  city: string;
  date: string;
  aqi: number;
  category: string;
  badAir: boolean;
};
export type Store = {
  profiles: Profile[];
  trips: Trip[];
  requests: Request[];
  impacts: Impact[];
  aqis: Aqi[];
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function upiLink(vpa: string, name: string, amount: number) {
  if (
    !/^[\w.-]+@[\w.-]+$/.test(vpa) ||
    !Number.isFinite(amount) ||
    amount <= 0
  )
    return null;
  return `upi://pay?${new URLSearchParams({ pa: vpa, pn: name, am: amount.toFixed(2), cu: "INR" })}`;
}
export function fuelShare(
  km: number,
  price: number,
  mileage: number,
  riders: number,
) {
  if (km <= 0 || price <= 0 || mileage <= 0 || riders < 1)
    throw Error("Enter valid distance, mileage and seats.");
  return (km * price) / (mileage * (riders + 1));
}
export function seed(): Store {
  const departAt = new Date(Date.now() + 25 * 60000).toISOString();
  return {
    profiles: [
      {
        userId: "demo-kapil",
        name: "Kapil",
        city: "Bengaluru",
        vehicleType: "NONE",
        fuel: "PETROL",
        mileageKmpl: 15,
        seats: 3,
        orgId: "demo-college",
        email: "kapil@example-college.ac.in",
      },
      {
        userId: "demo-ashwin",
        name: "Ashwin",
        city: "Bengaluru",
        vehicleType: "HATCHBACK",
        fuel: "PETROL",
        mileageKmpl: 18,
        seats: 3,
        orgId: "demo-college",
      },
      {
        userId: "demo-jd",
        name: "JD",
        city: "Bengaluru",
        vehicleType: "SEDAN",
        fuel: "PETROL",
        mileageKmpl: 16,
        seats: 2,
        orgId: "demo-college",
      },
    ],
    trips: [
      {
        id: "demo-trip-1",
        driverId: "demo-ashwin",
        orgId: "demo-college",
        city: "Bengaluru",
        startLabel: "Indiranagar",
        endLabel: "Electronic City",
        startLat: 12.9784,
        startLng: 77.6408,
        endLat: 12.8452,
        endLng: 77.6602,
        departAt,
        seatsLeft: 3,
        seatsTotal: 3,
        routeKm: 22.4,
        shareRupees: 31.11,
        status: "OPEN",
      },
      {
        id: "demo-trip-2",
        driverId: "demo-jd",
        orgId: "demo-college",
        city: "Bengaluru",
        startLabel: "Koramangala",
        endLabel: "Electronic City",
        startLat: 12.9352,
        startLng: 77.6245,
        endLat: 12.8452,
        endLng: 77.6602,
        departAt,
        seatsLeft: 2,
        seatsTotal: 2,
        routeKm: 16.8,
        shareRupees: 35,
        status: "OPEN",
      },
    ],
    requests: [],
    impacts: [],
    aqis: [
      {
        city: "Bengaluru",
        date: today(),
        aqi: 82,
        category: "Satisfactory",
        badAir: false,
      },
      {
        city: "Delhi",
        date: today(),
        aqi: 320,
        category: "Very poor",
        badAir: true,
      },
      {
        city: "Mumbai",
        date: today(),
        aqi: 94,
        category: "Satisfactory",
        badAir: false,
      },
    ],
  };
}
export function acceptDemo(store: Store, id: string, driverId: string): Store {
  const request = store.requests.find((r) => r.id === id);
  const trip = store.trips.find((t) => t.id === request?.tripId);
  if (
    !request ||
    !trip ||
    trip.driverId !== driverId ||
    request.status !== "PENDING" ||
    trip.status !== "OPEN" ||
    trip.seatsLeft < 1
  )
    throw Error("This request no longer has an available seat.");
  return {
    ...store,
    requests: store.requests.map((r) =>
      r.id === id ? { ...r, status: "ACCEPTED" } : r,
    ),
    trips: store.trips.map((t) =>
      t.id === trip.id ? { ...t, seatsLeft: t.seatsLeft - 1 } : t,
    ),
  };
}
export function completeDemo(store: Store, id: string, userId: string): Store {
  const trip = store.trips.find((t) => t.id === id);
  if (!trip || trip.driverId !== userId || trip.status !== "ACTIVE")
    throw Error("Only the driver can finish an active trip.");
  const riders = store.requests.filter(
    (r) => r.tripId === id && r.status === "ACCEPTED",
  );
  const double = store.aqis.some(
    (a) => a.city === trip.city && a.date === today() && a.badAir,
  )
    ? 2
    : 1;
  const impacts: Impact[] = riders.map((r) => ({
    id: crypto.randomUUID(),
    userId: r.riderId,
    tripId: id,
    month: today().slice(0, 7),
    kmShared: r.sharedKm,
    kgCO2: r.sharedKm * 0.14,
    rupees: Math.max(0, (r.sharedKm * 100) / 15 - trip.shareRupees),
    points: 5 * double,
    role: "RIDER",
  }));
  // Driver and rider share attribution to avoid double-counting the same avoided emissions.
  impacts.push({
    id: crypto.randomUUID(),
    userId,
    tripId: id,
    month: today().slice(0, 7),
    kmShared: riders.length ? trip.routeKm : 0,
    kgCO2: 0,
    rupees: riders.length * trip.shareRupees,
    points: riders.length * 10 * double,
    role: "DRIVER",
  });
  return {
    ...store,
    trips: store.trips.map((t) => (t.id === id ? { ...t, status: "DONE" } : t)),
    requests: store.requests.map((r) =>
      r.tripId === id && r.status === "ACCEPTED" ? { ...r, status: "DONE" } : r,
    ),
    impacts: [...store.impacts, ...impacts],
  };
}
