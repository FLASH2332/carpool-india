import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listOrganisations, setOrgAdmin } from "./cloud";
import type { OrgAdmins } from "./cloud";

/** Platform admin dashboard: every organisation and its admins. PlatformAdmins only. */
export function PlatformAdmin() {
  const [orgs, setOrgs] = useState<OrgAdmins[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    listOrganisations()
      .then((found) => {
        if (!cancelled) setOrgs(found);
      })
      .catch((e) => {
        if (!cancelled) setMessage(e instanceof Error ? e.message : "Could not load organisations.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(orgId: string, email: string, isAdmin: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const updated = await setOrgAdmin(orgId, email, isAdmin);
      setOrgs((all) => (all ?? []).map((org) => (org.id === orgId ? updated : org)));
      if (isAdmin) setDrafts((d) => ({ ...d, [orgId]: "" }));
      setMessage(isAdmin ? `${email} is now an admin.` : `${email} is no longer an admin.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The change failed.");
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent, orgId: string) {
    e.preventDefault();
    const email = (drafts[orgId] ?? "").trim();
    if (email) void change(orgId, email, true);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PLATFORM ADMIN</span>
          <h1>Organisation admins</h1>
          <p>Who can download each organisation's monthly report.</p>
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!orgs && !message && <p role="status">Loading organisations…</p>}
      {orgs?.length === 0 && (
        <p>No organisations yet. An organisation appears here once its first member signs in.</p>
      )}
      {orgs?.map((org) => (
        <section className="panel space-top" key={org.id} aria-label={org.name}>
          <h2>{org.name}</h2>
          <p className="fine">
            {org.domain} · {org.adminEmails.length} admin{org.adminEmails.length === 1 ? "" : "s"}
          </p>
          {org.adminEmails.map((email) => (
            <p className="fuel-share" key={email}>
              <span>{email}</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void change(org.id, email, false)}
              >
                Remove
              </button>
            </p>
          ))}
          {!org.adminEmails.length && <p>No admins yet.</p>}
          <form className="button-row" onSubmit={(e) => add(e, org.id)}>
            <input
              type="email"
              required
              aria-label={`New admin email for ${org.name}`}
              placeholder={`name@${org.domain}`}
              value={drafts[org.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [org.id]: e.target.value }))}
            />
            <button className="primary" disabled={busy}>
              Add admin
            </button>
          </form>
        </section>
      ))}
    </>
  );
}
