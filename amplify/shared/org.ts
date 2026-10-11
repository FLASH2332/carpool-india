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
