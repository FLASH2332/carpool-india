import { client } from './cloud';
import outputs from '../amplify_outputs.json';
import type { TransitClaim } from '../amplify/shared/transit';
export const transitAvailable = ['submitTransitClaim', 'reviewTransitClaim'].every(n => n in outputs.data.model_introspection.mutations) && 'transitClaimsToday' in outputs.data.model_introspection.queries;
function result<T>(response: { data?: T | null; errors?: { message: string }[] }): T {
  if (response.errors?.length) throw Error(response.errors.map(e => e.message).join('; '));
  if (response.data == null) throw Error('The transit operation was not confirmed. Refresh before retrying.');
  return response.data;
}
export async function transitToday(reviewQueue = false) {
  return result(await client.queries.transitClaimsToday({ reviewQueue })).filter((r): r is NonNullable<typeof r> => Boolean(r)) as TransitClaim[];
}
export async function submitTicket(file: File) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 450_000) throw Error('Choose a readable JPEG or PNG under 450 kB.');
  const imageBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(Error('Could not read this ticket.'));
    reader.readAsDataURL(file);
  });
  return result(await client.mutations.submitTransitClaim({ imageBase64 }));
}
export async function reviewTicket(row: TransitClaim, approve: boolean, verifiedKm: number, note: string) {
  return result(await client.mutations.reviewTransitClaim({ userId: row.userId, claimId: row.id, approve, ...(approve ? { verifiedKm } : {}), note }));
}
