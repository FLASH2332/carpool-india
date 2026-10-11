import { useEffect, useState } from 'react';
import { isOrgAdmin } from './cloud';
import { reviewTicket, submitTicket, transitAvailable, transitToday } from './transit';
import type { TransitClaim } from '../amplify/shared/transit';
type Props = { eligible: boolean; onRefresh: () => Promise<void> };
export function TransitPanel({ eligible, onRefresh }: Props) {
  const [claims, setClaims] = useState<TransitClaim[]>([]), [queue, setQueue] = useState<TransitClaim[]>([]);
  const [admin, setAdmin] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!transitAvailable) return;
    let live = true;
    Promise.all([transitToday(), isOrgAdmin()]).then(async ([own, yes]) => {
      if (!live) return;
      setClaims(own); setAdmin(yes);
      if (yes) { const pending = await transitToday(true); if (live) setQueue(pending); }
    }).catch(e => { if (live) setMessage(e instanceof Error ? e.message : 'Unable to load claims.'); });
    const timer = window.setInterval(() => {
      const now = Date.now() / 1000;
      setClaims(rows => rows.filter(r => r.expiresAt > now)); setQueue(rows => rows.filter(r => r.expiresAt > now));
    }, 1000);
    return () => { live = false; window.clearInterval(timer); };
  }, [revision]);
  async function upload(file: File) {
    setBusy(true); setMessage('Extracting your ticket…');
    try {
      const claim = await submitTicket(file);
      setMessage(claim.status === 'APPROVED' ? `Approved: ${claim.points} points earned.` : 'Sent for organisation admin review. Pending claims earn no points.');
      setRevision(n => n + 1); await onRefresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Submission failed.'); }
    finally { setBusy(false); }
  }
  async function review(row: TransitClaim, approve: boolean, km: number, note: string) {
    setBusy(true); setMessage('');
    try { await reviewTicket(row, approve, km, note); setRevision(n => n + 1); await onRefresh(); setMessage(approve ? 'Claim approved and rewards recorded.' : 'Claim rejected.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Review failed.'); }
    finally { setBusy(false); }
  }
  return <section className="panel transit-panel" aria-label="Public transport rewards">
    <span className="eyebrow">LEAVE YOUR CAR AT HOME</span><h2>Public transport rewards</h2>
    <p>Take the metro or bus and submit today’s dated journey ticket. Earn 5–7 impact points, doubled on bad-air days, after approval.</p>
    <p className="fine">Your image is sent for text extraction without being saved by this app. Duplicate checks use only your own ticket metadata. Metadata and pending reviews expire at midnight India time; approved reward totals remain in My Impact.</p>
    {!transitAvailable ? <p role="status">Transit rewards need a backend update and fresh Amplify configuration. Your existing ride features are unchanged.</p> : <>
      <p className="fine">Use a JPEG or PNG under 450 kB with a single date and readable From / To labels. Passes without a specific journey are unsupported. Factors are provisional and claims currently require admin review.</p>
      {!eligible && <p>Add a vehicle to your profile to qualify.</p>}
      <label className="transit-upload">Scan a journey ticket<input type="file" accept="image/png,image/jpeg" disabled={busy || !eligible} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} /></label>
      <button className="secondary" disabled={busy} onClick={() => { setRevision(n => n + 1); void onRefresh().catch(e => setMessage(String(e))); }}>Refresh claims and impact</button>
      <div role="status" aria-live="polite">{message}</div>
      <h3>Your tickets today</h3>{claims.length ? claims.map(row => <article key={row.id} className="transit-row"><b>{row.mode} · {row.from} → {row.to}</b><p>{row.date} {row.time} · {row.status} · {row.status === 'APPROVED' ? `${row.points} points · ${row.kgCO2} kg CO₂` : 'No rewards yet'}</p><small>{row.reason}</small></article>) : <p>No tickets submitted today.</p>}
      {admin && <div><h3>Organisation review queue</h3><p className="fine">Review extracted metadata with the claimant in person. Images are unavailable. Verify the dated journey and counterfactual driving distance; reject unverifiable claims before midnight.</p>{queue.length ? queue.map(row => <ReviewRow key={`${row.userId}/${row.id}`} row={row} busy={busy} review={review} />) : <p>No pending claims in your organisation.</p>}</div>}
    </>}
  </section>;
}
function ReviewRow({ row, busy, review }: { row: TransitClaim; busy: boolean; review: (r: TransitClaim, approve: boolean, km: number, note: string) => Promise<void> }) {
  const [km, setKm] = useState(row.km ? String(row.km) : ''), [note, setNote] = useState('');
  return <article className="transit-row"><b>{row.mode} · {row.from} → {row.to}</b><p>{row.date} {row.time} · Ticket {row.ticket || 'unknown'} · OCR confidence {row.confidence.toFixed(1)}%</p><small>Participant: {row.userId}</small>
    <label>Verified car-route distance (km)<input type="number" min="0.01" max="200" step="0.01" value={km} onChange={e => setKm(e.target.value)} /></label>
    <label>Review note<input maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="How was this journey verified?" /></label>
    <div className="actions"><button disabled={busy || !note.trim() || !(Number(km) > 0 && Number(km) <= 200)} onClick={() => void review(row, true, Number(km), note)}>Approve reward</button><button className="secondary" disabled={busy || !note.trim()} onClick={() => void review(row, false, 0, note)}>Reject</button></div>
  </article>;
}
