import { User } from '../types';

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseCsvSet = (value: unknown, normalize = false): Set<string> => {
  if (typeof value !== 'string') return new Set();
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => (normalize ? item.toLowerCase() : item));
  return new Set(items);
};

const DEFAULT_INTERNAL_ROLES = new Set(['admin', 'store_admin', 'supervisor', 'agent']);

const widgetEnabledByDefault = Boolean(import.meta.env.DEV);
const WIDGET_ENABLED = parseBoolean(import.meta.env.VITE_SEMANTIC_WIDGET_ENABLED, widgetEnabledByDefault);
const INTERNAL_ONLY = parseBoolean(import.meta.env.VITE_SEMANTIC_WIDGET_INTERNAL_ONLY, true);
const ALLOWED_ROLES = (() => {
  const configured = parseCsvSet(import.meta.env.VITE_SEMANTIC_WIDGET_ALLOWED_ROLES, true);
  return configured.size > 0 ? configured : DEFAULT_INTERNAL_ROLES;
})();
const ALLOWED_EMAILS = parseCsvSet(import.meta.env.VITE_SEMANTIC_WIDGET_ALLOWED_EMAILS, true);
const ALLOWED_COMPANIES = parseCsvSet(import.meta.env.VITE_SEMANTIC_WIDGET_ALLOWED_COMPANY_IDS, false);
const BLOCKED_COMPANIES = parseCsvSet(import.meta.env.VITE_SEMANTIC_WIDGET_BLOCKED_COMPANY_IDS, false);

export interface WidgetEligibility {
  enabled: boolean;
  reason: string;
}

export const getSemanticWidgetEligibility = (user: User | null): WidgetEligibility => {
  if (!WIDGET_ENABLED) {
    return { enabled: false, reason: 'feature_disabled' };
  }

  if (!user) {
    return { enabled: false, reason: 'no_user' };
  }

  const companyId = user.companyId || '';
  const normalizedRole = String(user.role || '').trim().toLowerCase();
  const normalizedEmail = String(user.email || '').trim().toLowerCase();

  if (companyId && BLOCKED_COMPANIES.has(companyId)) {
    return { enabled: false, reason: 'company_blocked' };
  }

  if (ALLOWED_COMPANIES.size > 0 && (!companyId || !ALLOWED_COMPANIES.has(companyId))) {
    return { enabled: false, reason: 'company_not_allowed' };
  }

  if (!INTERNAL_ONLY) {
    return { enabled: true, reason: 'enabled_public' };
  }

  if (ALLOWED_ROLES.has(normalizedRole)) {
    return { enabled: true, reason: 'enabled_internal_role' };
  }

  if (normalizedEmail && ALLOWED_EMAILS.has(normalizedEmail)) {
    return { enabled: true, reason: 'enabled_internal_email' };
  }

  return { enabled: false, reason: 'internal_only' };
};

