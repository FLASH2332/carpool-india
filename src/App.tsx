import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  confirmResetPassword,
  confirmSignUp,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import {
  acceptDemo,
  completeDemo,
  fuelShare,
  money,
  seed,
  today,
} from "./domain";
import type { Profile, Store, Trip } from "./domain";
import {
  client,
  loadCloud,
  saveCloudProfile,
  subscribeCloud,
  workflowMissing,
  respondCloud,
  startCloud,
  completeCloud,
} from "./cloud";
import { Rewards } from "./RewardsPanel";
import { FindCloud, OfferCloud, TripMap } from "./CloudRides";
import "./App.css";

type Page = "home" | "find" | "offer" | "rides" | "impact" | "profile";
const pages: [Page, string, string][] = [
  ["home", "Overview", "◈"],
  ["find", "Find a ride", "⌕"],
  ["offer", "Offer a ride", "+"],
  ["rides", "My rides", "↗"],
  ["impact", "My impact", "◎"],
  ["profile", "My profile", "○"],
];
const empty: Store = {
  profiles: [],
  trips: [],
  requests: [],
  impacts: [],
  aqis: [],
};
const demoKey = "greencommute-demo-v1";
function readDemo(): Store {
  try {
    const data = JSON.parse(localStorage.getItem(demoKey) || "null");
    if (
      data?.profiles?.length &&
      Array.isArray(data.trips) &&
      Array.isArray(data.requests) &&
      Array.isArray(data.impacts) &&
      Array.isArray(data.aqis)
    )
      return data;
  } catch {
    /* fresh demo */
  }
  return seed();
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function RouteMap({ trip, live = false }: { trip?: Trip; live?: boolean }) {
  return (
    <div
      className="route-map"
      role="img"
      aria-label={`Illustrative route diagram${trip ? ` from ${trip.startLabel} to ${trip.endLabel}` : ""}; not a navigation map`}
    >
      <svg
        viewBox="0 0 620 360"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="620" height="360" fill="#edf1e8" />
        <path
          d="M430 -30 Q390 100 490 150 T460 390"
          fill="none"
          stroke="#c8dcd8"
          strokeWidth="40"
        />
        <g fill="#d9e5d2">
          <rect x="60" y="40" width="100" height="55" rx="14" />
          <rect x="220" y="245" width="100" height="95" rx="22" />
          <rect x="460" y="30" width="110" height="80" rx="30" />
        </g>
        <g stroke="#fff" strokeWidth="11" fill="none">
          <path d="M0 130 L620 90 M0 220 L620 280 M120 0 L210 360 M330 0 L370 360 M550 0 L520 360 M0 330 L620 170" />
        </g>
        <g fill="#92a38d" fontSize="11" fontFamily="Arial">
          <text x="230" y="60">
            BENGALURU
          </text>
          <text x="50" y="285">
            GREEN CORRIDOR
          </text>
          <text x="470" y="130">
            LAKE
          </text>
        </g>
        <path
          d="M175 115 L245 112 L260 204 L347 222 L355 278"
          fill="none"
          stroke="#fff"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M175 115 L245 112 L260 204 L347 222 L355 278"
          fill="none"
          stroke="#28724c"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle
          cx="175"
          cy="115"
          r="10"
          fill="#28724c"
          stroke="white"
          strokeWidth="4"
        />
        <circle
          cx="355"
          cy="278"
          r="10"
          fill="#e8ab53"
          stroke="white"
          strokeWidth="4"
        />
        {live && (
          <circle
            cx="260"
            cy="204"
            r="13"
            fill="#284d42"
            stroke="white"
            strokeWidth="5"
          />
        )}
      </svg>
      <span className="map-label">
        Illustrative route · map integration pending
      </span>
      {trip && (
        <div className="map-card">
          <b>
            {trip.startLabel} → {trip.endLabel}
          </b>
          <span>
            {trip.routeKm} km shared · {money(trip.shareRupees)} / rider
          </span>
        </div>
      )}
    </div>
  );
}
function Auth({
  onLogin,
  onDemo,
}: {
  onLogin: (id: string, email?: string) => void;
  onDemo: () => void;
}) {
  const [step, setStep] = useState<
    "login" | "signup" | "confirm" | "reset" | "reset-confirm"
  >("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const username = email.trim().toLowerCase();
      if (step === "signup") {
        const result = await signUp({
          username,
          password,
          options: { userAttributes: { email: username } },
        });
        setStep(result.isSignUpComplete ? "login" : "confirm");
        setPassword("");
        setMessage("Check your email for a verification code.");
      } else if (step === "confirm") {
        await confirmSignUp({ username, confirmationCode: code.trim() });
        setStep("login");
        setCode("");
        setMessage("Email verified. You can sign in now.");
      } else if (step === "reset") {
        await resetPassword({ username });
        setStep("reset-confirm");
        setMessage("Check your email for a reset code.");
      } else if (step === "reset-confirm") {
        await confirmResetPassword({
          username,
          confirmationCode: code.trim(),
          newPassword: password,
        });
        setPassword("");
        setCode("");
        setStep("login");
        setMessage("Password updated. Sign in to continue.");
      } else {
        const result = await signIn({ username, password });
        if (result.isSignedIn) {
          const user = await getCurrentUser();
          setPassword("");
          onLogin(user.userId, username);
        } else if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
          setStep("confirm");
          setMessage("Verify your email before signing in.");
        } else {
          setMessage(
            `Sign-in requires ${result.nextStep.signInStep}. This account needs an additional authentication step.`,
          );
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message.replace(/^PreSignUp failed with error\s*/i, "").replace(/\.$/, "")
          : "Unable to authenticate. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title = {
    login: "Your commute, with company.",
    signup: "Join a greener commute.",
    confirm: "Check your inbox.",
    reset: "Let’s get you back in.",
    "reset-confirm": "Choose a new password.",
  }[step];
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">SMALL JOURNEYS. BIG CHANGE.</span>
          <h1>
            A better way
            <br />
            to get there.
          </h1>
          <p>
            Share the ride with people from your office or college. Split the
            fuel. Leave a lighter footprint.
          </p>
          <RouteMap trip={seed().trips[0]} />
        </div>
        <span className="muted">Built for India · Powered by AWS Mumbai</span>
      </section>
      <section className="auth-panel">
        <span className="eyebrow">GREENCOMMUTE INDIA</span>
        <h2>{title}</h2>
        <p className="muted">
          {step === "login"
            ? "Sign in with your commute account, or explore the demo."
            : "Your app account is separate from AWS and GitHub."}
        </p>
        <form onSubmit={submit}>
          <Field label="Email address">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {["login", "signup", "reset-confirm"].includes(step) && (
            <Field
              label={step === "reset-confirm" ? "New password" : "Password"}
            >
              <input
                type="password"
                autoComplete={
                  step === "login" ? "current-password" : "new-password"
                }
                required
                minLength={step === "login" ? 1 : 8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {["confirm", "reset-confirm"].includes(step) && (
            <Field label="Email verification code">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : step === "login"
                ? "Sign in →"
                : step === "signup"
                  ? "Create commute account →"
                  : step === "reset"
                    ? "Send reset code"
                    : "Confirm"}
          </button>
        </form>
        <div className="auth-links">
          <button
            onClick={() => {
              setStep(step === "login" ? "signup" : "login");
              setMessage("");
              setPassword("");
            }}
          >
            {step === "login" ? "Create an account" : "Back to sign in"}
          </button>
          {step === "login" && (
            <button
              onClick={() => {
                setStep("reset");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
          )}
          {step === "confirm" && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await resendSignUpCode({
                    username: email.trim().toLowerCase(),
                  });
                  setMessage("A new code has been sent.");
                } catch (e) {
                  setMessage(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend code
            </button>
          )}
        </div>
        <div className="divider">or take a look around</div>
        <button className="secondary wide" onClick={onDemo}>
          Explore the interactive demo ↗
        </button>
        <p className="fine">
          Demo uses fictional riders and seeded AQI. No AWS account needed to
          explore.
        </p>
      </section>
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span>↗</span>
      <div>
        greencommute<small>INDIA</small>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<"auth" | "demo" | "cloud">("auth");
  const [userId, setUserId] = useState("demo-kapil");
  const [email, setEmail] = useState("");
  const [store, setStore] = useState<Store>(empty);
  const [page, setPage] = useState<Page>(
    () =>
      pages.find((p) => p[0] === window.location.hash.slice(1))?.[0] || "home",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [tracking, setTracking] = useState(false);
  const [settlements, setSettlements] = useState<Record<string, { riderId?: string | null; share?: number | null; upiLink?: string | null }[]>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const lastSend = useRef(0);
  const sending = useRef(false);
  const loadVersion = useRef(0);
  useEffect(() => {
    const change = () =>
      setPage(
        pages.find((p) => p[0] === window.location.hash.slice(1))?.[0] ||
          "home",
      );
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const profile = store.profiles.find((p) => p.userId === userId);
  const city = profile?.city || "Bengaluru";
  const aqi = store.aqis.find((a) => a.city === city && a.date === today());
  const myImpact = store.impacts.filter((i) => i.userId === userId);
  const selected = store.trips.find((t) => t.id === selectedId);
  const activeTripId = selected?.id;
  const activeStatus = selected?.status;
  const activeDriver = selected?.driverId;
  const available = store.trips.filter(
    (t) =>
      t.status === "OPEN" &&
      t.seatsLeft > 0 &&
      t.driverId !== userId &&
      t.city === city &&
      new Date(t.departAt).getTime() >= now &&
      (!profile?.orgId || t.orgId === profile.orgId),
  );
  const totals = myImpact.reduce(
    (a, i) => ({
      km: a.km + i.kmShared,
      co2: a.co2 + i.kgCO2,
      rupees: a.rupees + i.rupees,
      points: a.points + i.points,
    }),
    { km: 0, co2: 0, rupees: 0, points: 0 },
  );
  const reload = useCallback(async () => {
    setLoading(true);
    const version = ++loadVersion.current;
    try {
      const data = await loadCloud(userId);
      if (version === loadVersion.current) setStore(data);
    } catch (e) {
      if (version === loadVersion.current)
        setMessage(
          e instanceof Error ? e.message : "Could not load your rides.",
        );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((u) => {
        if (!cancelled) {
          setUserId(u.userId);
          setEmail(u.signInDetails?.loginId || "");
          setMode("cloud");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (mode !== "cloud") return;
    void reload();
    return () => {
      // This ref is a request sequence counter; cleanup deliberately invalidates the latest request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++loadVersion.current;
    };
  }, [mode, reload]);
  useEffect(() => {
    if (mode !== "cloud") return;
    const cleanup = subscribeCloud(
      () => {
        void reload();
      },
      () =>
        setMessage(
          "Live updates disconnected. Use Refresh to load the latest data.",
        ),
    );
    return () => {
      cleanup();
    };
  }, [mode, reload, userId]);
  useEffect(() => {
    if (mode === "demo") {
      try {
        localStorage.setItem(demoKey, JSON.stringify(store));
      } catch {
        // An external storage failure is reported asynchronously after the effect.
        queueMicrotask(() => setMessage("Browser storage unavailable. Demo changes will last for this visit only."));
      }
    }
  }, [store, mode]);
  useEffect(() => {
    if (
      !tracking ||
      !activeTripId ||
      activeStatus !== "ACTIVE" ||
      activeDriver !== userId
    )
      return;
    if (mode === "demo") {
      const timer = setInterval(
        () =>
          setStore((s) => ({
            ...s,
            trips: s.trips.map((t) =>
              t.id === activeTripId
                ? {
                    ...t,
                    lastLat:
                      (t.lastLat || t.startLat) + (t.endLat - t.startLat) / 100,
                    lastLng:
                      (t.lastLng || t.startLng) + (t.endLng - t.startLng) / 100,
                    lastAt: new Date().toISOString(),
                  }
                : t,
            ),
          })),
        5000,
      );
      return () => clearInterval(timer);
    }
    if (!navigator.geolocation) {
      queueMicrotask(() => { setMessage("This browser does not support live location."); setTracking(false); });
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      async (position) => {
        if (Date.now() - lastSend.current < 5000 || sending.current) return;
        lastSend.current = Date.now();
        sending.current = true;
        try {
          const result = await client.mutations.updateTripLocation({
            tripId: activeTripId,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          if (result.errors?.length)
            throw Error(result.errors.map((e) => e.message).join("; "));
        } catch (e) {
          setMessage(
            e instanceof Error ? e.message : "Could not share location.",
          );
          setTracking(false);
        } finally {
          sending.current = false;
        }
      },
      (error) => {
        setMessage(error.message);
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [
    tracking,
    activeTripId,
    activeStatus,
    activeDriver,
    mode,
    userId,
  ]);
  async function run(action: () => void | Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function demoOnly(action: () => void) {
    if (mode !== "demo") throw Error(workflowMissing);
    action();
  }
  function navigate(next: Page) {
    // Browser history is an external system updated by this event handler.
    // eslint-disable-next-line react/immutability
    window.location.hash = next;
    setPage(next);
    setMessage("");
  }
  function request(trip: Trip) {
    void run(() =>
      demoOnly(() => {
        if (
          store.requests.some(
            (r) =>
              r.tripId === trip.id &&
              r.riderId === userId &&
              ["PENDING", "ACCEPTED"].includes(r.status),
          )
        )
          throw Error("You already have a request for this trip.");
        setStore((s) => ({
          ...s,
          requests: [
            ...s.requests,
            {
              id: crypto.randomUUID(),
              tripId: trip.id,
              riderId: userId,
              driverId: trip.driverId,
              status: "PENDING",
              pickupLabel: trip.startLabel,
              dropLabel: trip.endLabel,
              pickupLat: trip.startLat,
              pickupLng: trip.startLng,
              dropLat: trip.endLat,
              dropLng: trip.endLng,
              sharedKm: trip.routeKm,
            },
          ],
        }));
        setSelectedId(trip.id);
        setPage("rides");
        setMessage(
          "Request sent. In the demo, switch to the driver above to accept it.",
        );
      }),
    );
  }
  if (loading && mode === "auth")
    return <div className="loading">Loading your commute…</div>;
  if (mode === "auth")
    return (
      <Auth
        onLogin={(id, address) => {
          setUserId(id);
          setEmail(address || "");
          setMode("cloud");
          setPage("home");
        }}
        onDemo={() => {
          setStore(readDemo());
          setMode("demo");
          setUserId("demo-kapil");
          setPage("home");
          setMessage("");
        }}
      />
    );
  const renderTrip = (trip: Trip) => {
    const driver = store.profiles.find((p) => p.userId === trip.driverId);
    const requested = store.requests.some(
      (r) =>
        r.tripId === trip.id &&
        r.riderId === userId &&
        ["PENDING", "ACCEPTED", "DONE"].includes(r.status),
    );
    return (
      <article className="trip-card" key={trip.id}>
        <div className="trip-person">
          <span className="avatar">{driver?.name?.slice(0, 1) || "D"}</span>
          <div>
            <b>{driver?.name || "Community driver"}</b>
            <small>
              {driver?.vehicleType?.toLowerCase() || "Shared commute"} ·{" "}
              {trip.seatsLeft} seats left
            </small>
          </div>
          <span className="price">
            {money(trip.shareRupees)}
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
            {new Date(trip.departAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST · {trip.routeKm} km
          </span>
          <button
            className="secondary"
            disabled={busy || requested}
            onClick={() => request(trip)}
          >
            {requested ? "Requested ✓" : "Request ride ↗"}
          </button>
        </div>
      </article>
    );
  };
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Logo />
        <span className="nav-caption">YOUR DAILY JOURNEY</span>
        <nav>
          {pages.map(([id, label, icon]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>✳</span>
          <b>
            One less car.
            <br />A little more clean air.
          </b>
          <p>Your everyday journey can make a difference.</p>
        </div>
        <button className="user-card" onClick={() => navigate("profile")}>
          <span className="avatar">{(profile?.name || "K").slice(0, 1)}</span>
          <span>
            <b>{profile?.name || "Your profile"}</b>
            <small>{city} ↗</small>
          </span>
        </button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            {city} <span className="muted">/</span>{" "}
            {pages.find((p) => p[0] === page)?.[1]}
          </span>
          <div>
            {mode === "demo" ? (
              <label className="demo-switch">
                DEMO{" "}
                <select
                  aria-label="Demo person"
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setTracking(false);
                    setMessage("");
                    setSelectedId("");
                  }}
                >
                  {store.profiles.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name}
                      {p.vehicleType !== "NONE" ? " · driver" : " · rider"}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <button onClick={() => void reload()} disabled={loading}>
                Refresh
              </button>
            )}
            <button
              onClick={() =>
                void run(async () => {
                  if (mode === "cloud") await signOut();
                  setMode("auth");
                  setStore(empty);
                  setTracking(false);
                  setMessage("");
                })
              }
            >
              {mode === "demo" ? "Exit demo" : "Sign out"}
            </button>
          </div>
        </header>
        <main>
          {mode === "demo" && (
            <div className="demo-banner">
              Interactive demo · fictional rides, seeded AQI and illustrative
              routes. Changes stay in this browser.
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {loading && <p role="status">Loading your rides…</p>}
          {!profile && mode === "cloud" && page !== "profile" && (
            <div className="notice">
              Welcome!{" "}
              <button onClick={() => navigate("profile")}>
                Complete your profile
              </button>{" "}
              to choose your city.
            </div>
          )}
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A LIGHTER WAY TO MOVE</span>
                  <h1>
                    Good to see you,{" "}
                    {profile?.name?.split(" ")[0] || "commuter"}
                    <span className="leaf"> ✳</span>
                  </h1>
                  <p>Same destination. Better together.</p>
                </div>
                <span className="date-chip">
                  {new Date(now).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              </div>
              <div className={`aqi-banner ${aqi?.badAir ? "bad-air" : ""}`}>
                <span className="aqi-icon">≈</span>
                <div>
                  <b>
                    {aqi
                      ? `${city} · ${aqi.category} air today`
                      : `No AQI reading for ${city} today`}
                  </b>
                  <p>
                    {aqi?.badAir
                      ? "Share your commute today. Earn double impact points."
                      : "Every shared seat is one small step toward cleaner air."}
                  </p>
                </div>
                <span className="aqi-value">
                  {aqi?.aqi ?? "—"}
                  <small>{mode === "demo" ? "SEEDED AQI" : "AQI"}</small>
                </span>
              </div>
              <div className="hero-grid">
                <section className="commute-hero">
                  <span className="eyebrow">YOUR NEXT COMMUTE</span>
                  <h2>
                    Skip the solo ride.
                    <br />
                    Find your people.
                  </h2>
                  <p>Office or college, there’s a seat going your way.</p>
                  <div className="button-row">
                    <button
                      className="primary"
                      onClick={() => navigate("find")}
                    >
                      Find a ride ↗
                    </button>
                    <button
                      className="secondary"
                      onClick={() => navigate("offer")}
                    >
                      Offer a ride +
                    </button>
                  </div>
                  <div className="community-proof">
                    <span className="mini-avatar">A</span>
                    <span className="mini-avatar">J</span>
                    <span className="mini-avatar">K</span>
                    <small>Share fuel costs with your community</small>
                  </div>
                </section>
                <RouteMap trip={available[0] || store.trips[0]} />
              </div>
              <div className="section-title">
                <h2>Your small steps add up</h2>
                <button onClick={() => navigate("impact")}>
                  View my impact ↗
                </button>
              </div>
              <div className="stats">
                <Stat
                  value={`${totals.co2.toFixed(2)} kg`}
                  label="CO₂ avoided"
                  icon="✳"
                />
                <Stat
                  value={money(totals.rupees)}
                  label="Commute savings"
                  icon="₹"
                />
                <Stat
                  value={String(totals.points)}
                  label="Impact points"
                  icon="◎"
                />
              </div>
              <div className="section-title">
                <h2>
                  Seats going your way{" "}
                  <span className="count">{available.length}</span>
                </h2>
                <button onClick={() => navigate("find")}>
                  See all rides ↗
                </button>
              </div>
              <div className="trip-grid">
                {available.slice(0, 2).map(renderTrip)}
                {!available.length && (
                  <Empty
                    text="No open rides in your city yet. Be the first to offer one."
                    action={() => navigate("offer")}
                    label="Offer a ride"
                  />
                )}
              </div>
            </>
          )}
          {page === "find" && (
            mode === "cloud" ? (
              <FindCloud
                profile={profile}
                requestedTripIds={store.requests
                  .filter((r) => r.riderId === userId && ["PENDING", "ACCEPTED"].includes(r.status))
                  .map((r) => r.tripId)}
                onRequested={() => {
                  void reload();
                  navigate("rides");
                  setMessage("Request sent. You will see it here when the driver responds.");
                }}
              />
            ) : <FindRides trips={available} renderTrip={renderTrip} mode={mode} />
          )}
          {page === "offer" && mode === "cloud" && (
            <OfferCloud
              profile={profile}
              onProfile={() => navigate("profile")}
              onPublished={(tripId, shareRupees) => {
                void reload();
                setSelectedId(tripId);
                navigate("rides");
                setMessage(`Trip published. Fuel share is ${money(shareRupees)} per rider.`);
              }}
            />
          )}
          {page === "offer" && mode !== "cloud" && (
            <Offer
              profile={profile}
              busy={busy}
              mode={mode}
              onProfile={() => navigate("profile")}
              onSubmit={(trip) =>
                run(() =>
                  demoOnly(() => {
                    setStore((s) => ({ ...s, trips: [...s.trips, trip] }));
                    setSelectedId(trip.id);
                    setPage("rides");
                    setMessage(
                      "Demo trip posted. Switch to a rider to request a seat.",
                    );
                  }),
                )
              }
            />
          )}
          {page === "profile" && !loading && (
            <ProfileForm
              key={userId}
              profile={profile}
              userId={userId}
              email={email}
              busy={busy}
              demo={mode === "demo"}
              onSave={(p) =>
                run(async () => {
                  if (mode === "cloud") {
                    await saveCloudProfile(p);
                    await reload();
                  } else
                    setStore((s) => ({
                      ...s,
                      profiles: [
                        ...s.profiles.filter((u) => u.userId !== userId),
                        p,
                      ],
                    }));
                  setMessage("Your profile is saved.");
                })
              }
            />
          )}
          {page === "rides" && (
            <>
              <Heading
                eyebrow="YOUR SHARED JOURNEYS"
                title="My rides"
                description="Requests, upcoming commutes and your live trip."
              />
              <div className="rides-grid">
                <section>
                  <h2>Ride requests</h2>
                  {store.requests
                    .filter(
                      (r) => r.riderId === userId || r.driverId === userId,
                    )
                    .map((r) => {
                      const trip = store.trips.find((t) => t.id === r.tripId);
                      return (
                        <article className="request-card" key={r.id}>
                          <span className={`status ${r.status.toLowerCase()}`}>
                            {r.status}
                          </span>
                          <h3>
                            {r.pickupLabel} → {r.dropLabel}
                          </h3>
                          <p>
                            {r.driverId === userId ? "Rider" : "Driver"}:{" "}
                            {store.profiles.find(
                              (p) =>
                                p.userId ===
                                (r.driverId === userId
                                  ? r.riderId
                                  : r.driverId),
                            )?.name || "Community member"}
                          </p>
                          {r.status === "PENDING" && r.driverId === userId && (
                            <div className="button-row">
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    if (mode === "cloud") { await respondCloud(r.id, true); await reload(); }
                                    else setStore(acceptDemo(store, r.id, userId));
                                  })
                                }
                              >
                                Accept
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    if (mode === "cloud") { await respondCloud(r.id, false); await reload(); return; }
                                    demoOnly(() =>
                                      setStore((s) => ({
                                        ...s,
                                        requests: s.requests.map((x) =>
                                          x.id === r.id
                                            ? { ...x, status: "DECLINED" }
                                            : x,
                                        ),
                                      })),
                                    );
                                  })
                                }
                              >
                                Decline
                              </button>
                            </div>
                          )}
                          {["ACCEPTED", "DONE"].includes(r.status) && trip && (
                            <button
                              className="secondary"
                              onClick={() => setSelectedId(trip.id)}
                            >
                              View trip ↗
                            </button>
                          )}
                          {mode === "demo" && r.riderId === userId && r.status === "PENDING" && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  demoOnly(() =>
                                    setStore((s) => ({
                                      ...s,
                                      requests: s.requests.map((x) =>
                                        x.id === r.id
                                          ? { ...x, status: "CANCELLED" }
                                          : x,
                                      ),
                                    })),
                                  ),
                                )
                              }
                            >
                              Cancel request
                            </button>
                          )}
                        </article>
                      );
                    })}
                  {!store.requests.some(
                    (r) => r.riderId === userId || r.driverId === userId,
                  ) && (
                    <Empty
                      text="Your ride requests will appear here."
                      label="Find a ride"
                      action={() => navigate("find")}
                    />
                  )}
                  <h2 className="space-top">Your offered rides</h2>
                  {store.trips
                    .filter((t) => t.driverId === userId)
                    .map((t) => (
                      <button
                        className="offered-trip"
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                      >
                        <b>
                          {t.startLabel} → {t.endLabel}
                        </b>
                        <span>
                          {t.status} · {t.seatsLeft} seats left ↗
                        </span>
                      </button>
                    ))}
                </section>
                <section>
                  {selected &&
                  (selected.driverId === userId ||
                    store.requests.some(
                      (r) =>
                        r.tripId === selected.id &&
                        r.riderId === userId &&
                        ["ACCEPTED", "DONE"].includes(r.status),
                    )) ? (
                    <>
                      <h2>
                        {selected.status === "DONE"
                          ? "Trip summary"
                          : "Your trip"}
                      </h2>
                      {mode === "cloud" ? (
                        <TripMap trip={selected} />
                      ) : (
                        <RouteMap
                          trip={selected}
                          live={selected.status === "ACTIVE"}
                        />
                      )}
                      <article className="panel">
                        <span className="status">{selected.status}</span>
                        <h3>
                          {selected.startLabel} → {selected.endLabel}
                        </h3>
                        <p>
                          {selected.routeKm} km · {money(selected.shareRupees)}{" "}
                          per rider
                        </p>
                        {selected.lastAt && (
                          <p className="fine">
                            Latest {mode === "demo" ? "simulated" : "GPS"}{" "}
                            location: {selected.lastLat?.toFixed(5)},{" "}
                            {selected.lastLng?.toFixed(5)} ·{" "}
                            {new Date(selected.lastAt).toLocaleTimeString(
                              "en-IN",
                            )}
                          </p>
                        )}
                        {selected.driverId === userId &&
                          selected.status === "OPEN" && (
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  if (mode === "cloud") { await startCloud(selected.id); await reload(); return; }
                                  demoOnly(() => {
                                    if (
                                      !store.requests.some(
                                        (r) =>
                                          r.tripId === selected.id &&
                                          r.status === "ACCEPTED",
                                      )
                                    )
                                      throw Error(
                                        "Accept a rider before starting a shared trip.",
                                      );
                                    setStore((s) => ({
                                      ...s,
                                      trips: s.trips.map((t) =>
                                        t.id === selected.id
                                          ? { ...t, status: "ACTIVE" }
                                          : t,
                                      ),
                                    }));
                                  });
                                })
                              }
                            >
                              Start trip →
                            </button>
                          )}
                        {selected.driverId === userId &&
                          selected.status === "ACTIVE" && (
                            <div className="button-row">
                              <button
                                className="secondary"
                                onClick={() => setTracking((t) => !t)}
                              >
                                {tracking
                                  ? "Stop sharing location"
                                  : mode === "demo"
                                    ? "Simulate location"
                                    : "Share live location"}
                              </button>
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    if (mode === "cloud") {
                                      setTracking(false);
                                      try {
                                        const completion = await completeCloud(selected.id);
                                        setSettlements(s => ({ ...s, [selected.id]: (completion.perRider ?? []).filter((r): r is NonNullable<typeof r> => !!r) }));
                                      }
                                      finally { await reload(); }
                                      return;
                                    }
                                    demoOnly(() => {
                                      setStore(
                                        completeDemo(
                                          store,
                                          selected.id,
                                          userId,
                                        ),
                                      );
                                      setTracking(false);
                                    });
                                  })
                                }
                              >
                                End trip
                              </button>
                            </div>
                          )}
                        {selected.status === "ACTIVE" &&
                          selected.driverId !== userId && (
                            <p className="notice">
                              {selected.lastAt
                                ? "Following the latest driver position."
                                : "Waiting for the driver to share location."}
                            </p>
                          )}
                        {selected.status === "DONE" && (
                          <>
                            {selected.driverId === userId && settlements[selected.id]?.map((r, index) => <p key={r.riderId ?? index}>Rider {index + 1}: final fuel share {money(r.share ?? 0)}<small className="fine"> · Confirmed by the completion operation. Share this amount with the rider.</small></p>)}
                            <div className="summary-numbers">
                              {myImpact
                                .filter((i) => i.tripId === selected.id)
                                .map((i) => (
                                  <p key={i.id}>
                                    <b>
                                      {i.kgCO2.toFixed(2)} kg CO₂ ·{" "}
                                      {money(i.rupees)} {i.role === "DRIVER" ? "fuel contributions" : "saved"} · {i.points}{" "}
                                      points
                                    </b>
                                  </p>
                                ))}
                            </div>
                            {mode === "demo" ? (
                              <p className="fine">
                                Demo only · no payment is collected.
                              </p>
                            ) : (
                              selected.driverId !== userId && (
                                <p className="fine">Ask the driver for the final fuel share. The backend does not yet store a rider settlement that can be retrieved on this device.</p>
                              )
                            )}
                            <button
                              className="secondary"
                              onClick={() => navigate("impact")}
                            >
                              See my impact ↗
                            </button>
                          </>
                        )}
                      </article>
                    </>
                  ) : (
                    <Empty text="Choose one of your trips to see its route and status." />
                  )}
                </section>
              </div>
            </>
          )}
          {page === "impact" && (
            <>
              <Heading
                eyebrow="BETTER, ONE RIDE AT A TIME"
                title="My impact"
                description="A lighter footprint starts with the journey you already make."
              />
              <div className="stats four">
                <Stat
                  value={`${totals.co2.toFixed(2)} kg`}
                  label="CO₂ avoided"
                  icon="✳"
                />
                <Stat
                  value={money(totals.rupees)}
                  label="Savings / fuel contributions"
                  icon="₹"
                />
                <Stat
                  value={`${totals.km.toFixed(1)} km`}
                  label="Distance shared"
                  icon="↗"
                />
                <Stat
                  value={String(totals.points)}
                  label="Impact points"
                  icon="◎"
                />
              </div>
              <Rewards store={store} userId={userId} demo={mode === "demo"} kgCO2={totals.co2} orgId={profile?.orgId} />
              <section className="panel impact-history">
                <h2>Your journey so far</h2>
                {myImpact.length ? (
                  myImpact.map((i) => (
                    <div className="history-row" key={i.id}>
                      <span className="avatar">↗</span>
                      <div>
                        <b>
                          {store.trips.find((t) => t.id === i.tripId)
                            ?.endLabel || "Shared commute"}
                        </b>
                        <small>
                          {i.month} · {i.role.toLowerCase()} ·{" "}
                          {i.kmShared.toFixed(1)} km
                        </small>
                      </div>
                      <b>
                        {i.kgCO2.toFixed(2)} kg CO₂
                        <small>{i.points} points</small>
                      </b>
                    </div>
                  ))
                ) : (
                  <Empty
                    text="Finish your first shared commute to see your impact."
                    label="Find a ride"
                    action={() => navigate("find")}
                  />
                )}
                <p className="fine">
                  {mode === "demo"
                    ? "Demo estimates use ₹100/litre, 15 km/litre and 0.14 kg CO₂/km for the rider. No detour is simulated. Real trips need server-calculated factors from Ashwin’s module."
                    : "Impact totals come from backend ImpactEntry records."}
                </p>
              </section>
            </>
          )}
          <footer>
            GreenCommute India{" "}
            <span>Share the journey. Change the everyday.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Stat({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: string;
}) {
  return (
    <article className="stat">
      <span>{icon}</span>
      <b>{value}</b>
      <small>{label}</small>
    </article>
  );
}
function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <span>↗</span>
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
        </button>
      )}
    </div>
  );
}
function FindRides({
  trips,
  renderTrip,
  mode,
}: {
  trips: Trip[];
  renderTrip: (t: Trip) => ReactNode;
  mode: string;
}) {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [time, setTime] = useState("");
  const [filters, setFilters] = useState({ pickup: "", drop: "", time: "" });
  const results = trips
    .filter(
      (t) =>
        t.startLabel.toLowerCase().includes(filters.pickup.toLowerCase()) &&
        t.endLabel.toLowerCase().includes(filters.drop.toLowerCase()) &&
        (!filters.time ||
          Math.abs(
            new Date(t.departAt).getTime() - new Date(filters.time).getTime(),
          ) <=
            30 * 60000),
    )
    .sort(
      (a, b) => new Date(a.departAt).getTime() - new Date(b.departAt).getTime(),
    );
  return (
    <>
      <Heading
        eyebrow="GOING YOUR WAY"
        title="Find your next ride"
        description="A shared seat. A familiar face. A greener journey."
      />
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ pickup: pickup.trim(), drop: drop.trim(), time });
        }}
      >
        <Field label="Pickup area">
          <input
            placeholder="e.g. Indiranagar"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
          />
        </Field>
        <Field label="Destination">
          <input
            placeholder="e.g. Electronic City"
            value={drop}
            onChange={(e) => setDrop(e.target.value)}
          />
        </Field>
        <Field label="Departure time">
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <button className="primary">Search rides ↗</button>
      </form>
      <p className="fine">
        Area-name search · sorted by departure · optional ±30 minute window.
        Nearby route matching and walking-distance ranking need Ashwin’s map
        components and Flash’s searchTrips Lambda.
      </p>
      <div className="section-title">
        <h2>
          {results.length} available {results.length === 1 ? "ride" : "rides"}
        </h2>
        <span className="muted">
          {mode === "demo" ? "Demo college community" : "Your city"}
        </span>
      </div>
      <div className="trip-grid">
        {results.map(renderTrip)}
        {!results.length && (
          <Empty text="No matching rides. Try a different area or departure time." />
        )}
      </div>
    </>
  );
}
function ProfileForm({
  profile,
  userId,
  email,
  busy,
  demo,
  onSave,
}: {
  profile?: Profile;
  userId: string;
  email: string;
  busy: boolean;
  demo: boolean;
  onSave: (p: Profile) => Promise<void>;
}) {
  const [value, setValue] = useState<Profile>(
    profile || {
      userId,
      name: "",
      email,
      city: "Bengaluru",
      vehicleType: "NONE",
      fuel: "PETROL",
      mileageKmpl: 15,
      seats: 3,
    },
  );
  function update<K extends keyof Profile>(key: K, v: Profile[K]) {
    setValue((p) => ({ ...p, [key]: v }));
  }
  return (
    <>
      <Heading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your commute profile"
        description="A few details to help you find your people."
      />
      <form
        className="panel profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(value);
        }}
      >
        <h2>About you</h2>
        <div className="form-grid">
          <Field label="Full name">
            <input
              required
              maxLength={80}
              value={value.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              type="tel"
              autoComplete="tel"
              value={value.phone || ""}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Field>
          <Field label="City">
            <select
              value={value.city}
              disabled={!demo}
              onChange={(e) => update("city", e.target.value)}
            >
              {["Bengaluru", "Delhi", "Mumbai"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input type="email" disabled value={value.email || email} />
          </Field>
        </div>
        <p className="fine">
          Organisation membership is assigned by the backend from your verified
          email.{" "}
          {demo
            ? "This demo uses a fictional college group."
            : profile?.orgId
              ? `Your organisation: ${profile.orgId}`
              : "Your organisation has not been assigned yet."}
        </p>
        <h2 className="space-top">
          Your vehicle <span className="muted">(optional)</span>
        </h2>
        <div className="form-grid">
          <Field label="Vehicle type">
            <select
              value={value.vehicleType}
              onChange={(e) =>
                update("vehicleType", e.target.value as Profile["vehicleType"])
              }
            >
              {[
                "NONE",
                "HATCHBACK",
                "SEDAN",
                "SUV",
                "SCOOTER",
                "MOTORCYCLE",
              ].map((v) => (
                <option key={v} value={v}>
                  {v === "NONE" ? "I’m a rider" : v.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          {value.vehicleType !== "NONE" && (
            <>
              <Field label="Fuel">
                <select
                  value={value.fuel}
                  onChange={(e) =>
                    update("fuel", e.target.value as Profile["fuel"])
                  }
                >
                  {["PETROL", "DIESEL", "CNG", "ELECTRIC"].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  value.fuel === "ELECTRIC"
                    ? "Efficiency (km/kWh)"
                    : "Mileage (km per fuel unit)"
                }
              >
                <input
                  type="number"
                  required
                  min="1"
                  max="200"
                  step="0.1"
                  value={value.mileageKmpl}
                  onChange={(e) =>
                    update("mileageKmpl", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Available passenger seats">
                <input
                  type="number"
                  required
                  min="1"
                  max={
                    ["SCOOTER", "MOTORCYCLE"].includes(value.vehicleType)
                      ? 1
                      : 6
                  }
                  value={value.seats}
                  onChange={(e) => update("seats", Number(e.target.value))}
                />
              </Field>
              <Field label="Number plate">
                <input
                  maxLength={20}
                  value={value.plate || ""}
                  onChange={(e) => update("plate", e.target.value)}
                />
              </Field>
              <Field label="UPI ID (optional)">
                <input
                  placeholder="yourname@bank"
                  pattern="[\w.\-]+@[\w.\-]+"
                  value={value.upiVpa || ""}
                  onChange={(e) => update("upiVpa", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile →"}
        </button>
      </form>
    </>
  );
}
function Offer({
  profile,
  busy,
  mode,
  onProfile,
  onSubmit,
}: {
  profile?: Profile;
  busy: boolean;
  mode: string;
  onProfile: () => void;
  onSubmit: (t: Trip) => Promise<void>;
}) {
  const [start, setStart] = useState("Indiranagar");
  const [end, setEnd] = useState("Electronic City");
  const [km, setKm] = useState(22.4);
  const [seats, setSeats] = useState(profile?.seats || 3);
  const [departure, setDeparture] = useState(() => {
    const d = new Date(Date.now() + 30 * 60000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [minimumDeparture] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [departureError, setDepartureError] = useState("");
  const share =
    km > 0 && seats > 0
      ? fuelShare(
          km,
          profile?.fuel === "ELECTRIC"
            ? 10
            : profile?.fuel === "DIESEL"
              ? 90
              : profile?.fuel === "CNG"
                ? 85
                : 100,
          profile?.mileageKmpl || 15,
          seats,
        )
      : 0;
  return (
    <>
      <Heading
        eyebrow="MAKE ROOM FOR A BETTER COMMUTE"
        title="Offer a ride"
        description="Already heading there? Bring someone along."
      />
      {!profile || profile.vehicleType === "NONE" ? (
        <Empty
          text="Add your vehicle to your profile before offering a ride."
          label="Add my vehicle"
          action={onProfile}
        />
      ) : (
        <div className="offer-grid">
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              // This comparison runs on form submission, never during render.
              // eslint-disable-next-line react/purity
              if (new Date(departure).getTime() <= Date.now()) {
                setDepartureError("Choose a departure time in the future.");
                return;
              }
              setDepartureError("");
              void onSubmit({
                id: crypto.randomUUID(),
                driverId: profile.userId,
                orgId: profile.orgId,
                city: profile.city,
                startLabel: start.trim(),
                endLabel: end.trim(),
                startLat: 12.9784,
                startLng: 77.6408,
                endLat: 12.8452,
                endLng: 77.6602,
                departAt: new Date(departure).toISOString(),
                seatsTotal: seats,
                seatsLeft: seats,
                routeKm: km,
                shareRupees: share,
                status: "OPEN",
              });
            }}
          >
            <Field label="Start area">
              <input
                required
                maxLength={120}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Destination">
              <input
                required
                maxLength={120}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Departure">
                <input
                  type="datetime-local"
                  required
                  min={minimumDeparture}
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </Field>
              <Field label="Passenger seats">
                <input
                  type="number"
                  required
                  min="1"
                  max={profile.seats}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                />
              </Field>
              <Field label="Demo route distance (km)">
                <input
                  type="number"
                  required
                  min="0.1"
                  max="300"
                  step="0.1"
                  value={km}
                  onChange={(e) => setKm(Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="fuel-share">
              <span>Estimated fuel share per rider</span>
              <b>{money(share)}</b>
            </div>
            {departureError && <p className="notice" role="status">{departureError}</p>}
            <p className="fine">
              Demo prices and fixed Bengaluru coordinates. Fuel cost split
              across {seats + 1} occupants. A real route and final share must be
              calculated by the backend.
            </p>
            {mode !== "demo" && <p className="notice">{workflowMissing}</p>}
            <button className="primary" disabled={busy || mode !== "demo"}>
              Post demo trip →
            </button>
          </form>
          <RouteMap />
        </div>
      )}
    </>
  );
}
