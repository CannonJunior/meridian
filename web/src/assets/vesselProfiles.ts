// A small STARTER reference library of vessel-class profiles, used by the
// "IDENTIFY CONTACT" workflow on an unidentified OOB contact's object card
// (see OobObjectCardBody.tsx) to let an analyst narrow candidates by
// country of origin, hull length, and radar band, then assign a tentative
// class identity to the contact.
//
// This is intentionally a small illustrative set, not a real intelligence
// database — Meridian doesn't yet ingest a real vessel-recognition catalog,
// AIS history, or ELINT library. The filters here are fully functional
// against this reference set; the "ports visited" filter is left wired up
// in the UI but disabled, since contact-specific port-call history isn't
// tracked anywhere in the app yet (see the IDENTIFY tab's note). Swapping
// this file for a real, larger source of vessel profiles is the intended
// growth path — the identify workflow doesn't otherwise need to change.
export interface VesselProfile {
  id: string;
  className: string;
  countryOfOrigin: string;
  lengthMinM: number;
  lengthMaxM: number;
  radarBand: string;
  typicalRole: string;
}

export const VESSEL_PROFILES: VesselProfile[] = [
  { id: 'udaloy', className: 'Udaloy-class destroyer', countryOfOrigin: 'Russia', lengthMinM: 162, lengthMaxM: 164, radarBand: 'S-band', typicalRole: 'ASW destroyer' },
  { id: 'sovremenny', className: 'Sovremenny-class destroyer', countryOfOrigin: 'Russia', lengthMinM: 155, lengthMaxM: 157, radarBand: 'E/F-band', typicalRole: 'Guided-missile destroyer' },
  { id: 'kilo', className: 'Kilo-class submarine', countryOfOrigin: 'Russia', lengthMinM: 70, lengthMaxM: 74, radarBand: 'I-band (surfaced/snorkel)', typicalRole: 'Diesel-electric attack submarine' },
  { id: 'type054a', className: 'Type 054A frigate', countryOfOrigin: 'China', lengthMinM: 132, lengthMaxM: 134, radarBand: 'C-band', typicalRole: 'Multi-role frigate' },
  { id: 'moudge', className: 'Moudge-class frigate', countryOfOrigin: 'Iran', lengthMinM: 94, lengthMaxM: 96, radarBand: 'X-band', typicalRole: 'Light frigate' },
  { id: 'ghadir', className: 'Ghadir-class submarine', countryOfOrigin: 'Iran', lengthMinM: 29, lengthMaxM: 29, radarBand: 'None (coastal SSK)', typicalRole: 'Midget submarine' },
  { id: 'semi-sub', className: 'Self-propelled semi-submersible', countryOfOrigin: 'Stateless / non-state trafficking', lengthMinM: 12, lengthMaxM: 25, radarBand: 'None / minimal RCS', typicalRole: 'Narcotics smuggling' },
  { id: 'merchant', className: 'Ocean-going merchant (AIS-dark)', countryOfOrigin: 'Flag of convenience', lengthMinM: 150, lengthMaxM: 300, radarBand: 'X-band (commercial nav)', typicalRole: 'Merchant / shadow-fleet tanker' },
];
