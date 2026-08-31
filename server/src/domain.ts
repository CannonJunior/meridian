// Domain classification for the live-domain Kafka pipeline (see
// liveDomainKafka.ts and kafka/README.md's "Live Domain Tracks" section).
// Mirrors web/src/selectors.ts's domainForTarget/domainForSensor/
// domainForUnit exactly — same duplication convention as types.ts relative
// to web/src/types.ts, since this server package and web/ don't share a
// package. If either copy's classification rule changes, update both.
import type { Category, Domain, FriendlyUnit, Sensor, Target } from './types.js';

export const DOMAINS: Domain[] = ['AIR', 'SEA', 'GROUND', 'SPACE'];

const CAT_DOMAIN: Record<Category, Domain> = {
  TEL: 'GROUND',
  SAM: 'GROUND',
  C2: 'GROUND',
  SHIP: 'SEA',
  BOAT: 'SEA',
  RADAR: 'GROUND',
  UAS: 'AIR',
  TROOP: 'GROUND',
  EMIT: 'GROUND',
};
export function domainForTarget(t: Target): Domain {
  return CAT_DOMAIN[t.cat] || 'GROUND';
}

const SPACE_SENSOR_PLATFORM = /\bSAT\b/;
export function domainForSensor(s: Sensor): Domain {
  if (SPACE_SENSOR_PLATFORM.test(s.platform)) return 'SPACE';
  if (s.altFt != null) return 'AIR';
  return 'GROUND';
}

const SEA_UNIT_KEYWORDS = /CARRIER|DESTROYER|CRUISER|FRIGATE|NAVAL|\bDDG\b|\bSHIP\b/;
const AIR_UNIT_KEYWORDS = /AIR PATROL|AIRCRAFT|BOMBER|FIGHTER|^[A-Z]{1,2}-\d/;
export function domainForUnit(u: FriendlyUnit): Domain {
  if (SEA_UNIT_KEYWORDS.test(u.platform) || SEA_UNIT_KEYWORDS.test(u.type)) return 'SEA';
  if (AIR_UNIT_KEYWORDS.test(u.platform) || AIR_UNIT_KEYWORDS.test(u.type)) return 'AIR';
  return 'GROUND';
}
