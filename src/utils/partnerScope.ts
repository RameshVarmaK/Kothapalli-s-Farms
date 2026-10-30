/**
 * Which fields and crop seasons a partner is part of: the ones where they
 * hold an ownership share. A season's own share list, when it has one,
 * replaces the field's, exactly as the settlement engine reads it.
 */
import { Field, MemberShare, Season } from '../types';

export function effectiveShares(season: Season, field: Field | undefined): MemberShare[] {
  if (Array.isArray(season.shares) && season.shares.length > 0) return season.shares;
  return Array.isArray(field?.shares) ? field.shares : [];
}

export function holdsShare(memberId: string, shares: MemberShare[]): boolean {
  return shares.some(s => s.memberId === memberId && Number(s.percentage) > 0);
}

export function seasonsOfPartner(memberId: string, fields: Field[], seasons: Season[]): Season[] {
  return seasons.filter(s => holdsShare(memberId, effectiveShares(s, fields.find(f => f.id === s.fieldId))));
}

/** Fields the partner has a share in directly, or through one of its seasons. */
export function fieldsOfPartner(memberId: string, fields: Field[], seasons: Season[]): Field[] {
  const viaSeason = new Set(seasonsOfPartner(memberId, fields, seasons).map(s => s.fieldId));
  return fields.filter(f => holdsShare(memberId, Array.isArray(f.shares) ? f.shares : []) || viaSeason.has(f.id));
}
