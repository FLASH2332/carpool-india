import { ORG_DOMAINS } from './factors';

/**
 * The organisation an email address belongs to (E1), or null for any other address.
 * Sub-domains count: `cs.example-college.ac.in` belongs to `example-college.ac.in`.
 */
export function orgForEmail(
  email: string | null | undefined,
  domains: typeof ORG_DOMAINS = ORG_DOMAINS,
) {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 1) return null;
  const host = email.slice(at + 1).trim().toLowerCase();
  const domain = Object.keys(domains).find(
    (d) => host === d || host.endsWith(`.${d}`),
  );
  return domain ? { domain, ...domains[domain] } : null;
}

export const normaliseEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() ?? '';

/** True when the email's host is the organisation's domain or a sub-domain of it. */
export function emailBelongsToDomain(
  email: string | null | undefined,
  domain: string,
): boolean {
  const address = normaliseEmail(email);
  const at = address.lastIndexOf('@');
  if (at < 1) return false;
  const host = address.slice(at + 1);
  const root = domain.trim().toLowerCase();
  return host === root || host.endsWith(`.${root}`);
}

/** True when the email is in an organisation's admin list. */
export function isListedAdmin(
  email: string | null | undefined,
  adminEmails: readonly (string | null)[] | null | undefined,
): boolean {
  const address = normaliseEmail(email);
  return (
    !!address &&
    (adminEmails ?? []).some((admin) => normaliseEmail(admin) === address)
  );
}

/** The admin list with one email added or removed; lower-cased, no duplicates. */
export function withAdmin(
  adminEmails: readonly (string | null)[] | null | undefined,
  email: string,
  isAdmin: boolean,
): string[] {
  const address = normaliseEmail(email);
  const rest = [
    ...new Set((adminEmails ?? []).map(normaliseEmail).filter(Boolean)),
  ].filter((admin) => admin !== address);
  return isAdmin ? [...rest, address] : rest;
}
