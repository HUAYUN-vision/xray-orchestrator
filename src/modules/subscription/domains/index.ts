import { CHINA_DOMAINS } from './china-domains';
import { RUSSIA_DOMAINS } from './russia-domains';

/**
 * Domains that must be opened without VPN (banks, gov services, local apps block foreign IPs).
 * Source: xray-server-instance/domains — keep in sync.
 */
export const DIRECT_DOMAINS: readonly string[] = [
  ...new Set([...RUSSIA_DOMAINS, ...CHINA_DOMAINS]),
];
