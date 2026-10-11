import { useEffect, useState } from "react";
import type { Store } from "./domain";
import { today } from "./domain";
import { loadLeaderboard } from "./cloud";
import { carbonPoints, makeLeaderboard, milestones } from "./rewards";
import type { Leader } from "./rewards";

export function Rewards({ store, userId, demo, kgCO2, orgId }: { store: Store; userId: string; demo: boolean; kgCO2: number; orgId?: string }) {
  const month = today().slice(0, 7);
  const [live, setLive] = useState<Leader[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (demo || !orgId) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setLoading(true); setLive([]); setError(""); } });
    loadLeaderboard(orgId, month).then(rows => { if (!cancelled) setLive(rows); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load your community standings."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [demo, orgId, userId, month, refresh, store.impacts]);
  const members = store.profiles.filter(p => p.orgId === orgId);
  const leaders = demo ? makeLeaderboard(store.impacts, members, month) : live;
  const next = milestones.find(m => kgCO2 < m.kg);
  const progress = next ? Math.min(100, Math.max(0, kgCO2 / next.kg * 100)) : 100;
  return <section className="rewards-grid" aria-label="Commute rewards">
    <article className="panel carbon-reward">
      <span className="eyebrow">SMALL RIDES, LASTING IMPACT</span>
      <h2>{carbonPoints(kgCO2)} <span className="muted">carbon points</span></h2>
      <p>Every kilogram of reported CO₂ avoided earns 10 carbon points.</p>
      <p className="fine">Calculated from your completed-trip impact. Carbon points and ride points are separate scores, with no cash value.</p>
      <div className="reward-progress" role="progressbar" aria-label={next ? `Progress to ${next.name}` : "All carbon milestones earned"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div>
      <p><b>{next ? `${Math.max(0, next.kg - kgCO2).toFixed(2)} kg to ${next.name}` : "Carbon trailblazer unlocked"}</b></p>
      <div className="badges">{milestones.map(m => <span key={m.kg} className={kgCO2 >= m.kg ? "badge earned" : "badge"}>{kgCO2 >= m.kg ? "✳" : "○"} {m.name}<small>{m.kg} kg CO₂</small></span>)}</div>
      <p className="fine">Ride points: 5 for a rider, 10 per shared rider for a driver; doubled on bad-air days. Carbon points are not doubled.</p>
    </article>
    <article className="panel leaderboard">
      <div className="leaderboard-heading"><div><span className="eyebrow">YOUR COMMUNITY · {month}</span><h2>Monthly leaderboard</h2></div>{!demo && <button className="secondary" disabled={loading || !orgId} onClick={() => setRefresh(n => n + 1)}>Refresh</button>}</div>
      <p className="fine">{demo ? "Demo standings · fictional members" : "Same-organisation members · reported completed-trip impact"}. Ranked by carbon points, then CO₂ and ride points.</p>
      {loading ? <p role="status">Loading standings…</p> : error ? <p role="alert">{error}</p> : !orgId ? <p>Save your profile to join your community.</p> : leaders.length ? <ol className="leader-list">{leaders.slice(0, 10).map((row, i) => <li key={row.userId} className={row.userId === userId ? "current-member" : ""}><span className="rank">{i + 1}</span><div><b>{row.name}{row.userId === userId ? " (you)" : ""}</b><small>{row.kgCO2.toFixed(2)} kg CO₂ · {row.trips} shared rides · {row.ridePoints} ride points</small></div><strong>{row.carbonPoints}<small>carbon pts</small></strong></li>)}</ol> : <p>Be the first to complete a shared commute this month.</p>}
      <p className="fine">Individual attribution only; do not sum standings as total community CO₂ savings. Live scores depend on backend completion records.</p>
    </article>
  </section>;
}
