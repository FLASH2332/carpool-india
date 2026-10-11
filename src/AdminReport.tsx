import { useEffect, useState } from "react";
import { isOrgAdmin, orgReportUrl } from "./cloud";
import { today } from "./domain";

/** Monthly organisation report download. Renders nothing for non-admins. */
export function AdminReport() {
  const [admin, setAdmin] = useState(false);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    isOrgAdmin()
      .then((yes) => {
        if (!cancelled) setAdmin(yes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!admin) return null;

  async function download() {
    setBusy(true);
    setError("");
    try {
      // The link carries a download header, so this saves the file without leaving the page.
      window.location.assign(await orgReportUrl(month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="Organisation report">
      <span className="eyebrow">ORGANISATION ADMIN</span>
      <h2>Monthly report</h2>
      <p>
        People pooling, trips shared, km shared, CO₂ avoided and cars kept off
        the road for your organisation, as a CSV file.
      </p>
      <label className="field">
        <span>Month</span>
        <input
          type="month"
          required
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || !month} onClick={() => void download()}>
        {busy ? "Preparing…" : "Download monthly report ↓"}
      </button>
    </section>
  );
}
