import { ROLES, type Role } from './enums.js';

/**
 * Granular permissions. Authorization checks name a capability, never a role,
 * so an operator can re-shape a role in the database without touching code.
 *
 * Roles below are the *seeded defaults*; the database is authoritative at
 * runtime and the seeded grants can be edited from Admin → Users → Roles.
 */
export const PERMISSIONS = {
  'appointments.read': 'View bookings',
  'appointments.read.own': 'View own bookings',
  'appointments.create': 'Create bookings',
  'appointments.update': 'Edit bookings',
  'appointments.reschedule': 'Reschedule bookings',
  'appointments.cancel': 'Cancel bookings',

  'clients.read': 'View every client',
  'clients.read.own': 'View clients you have worked with',
  'clients.update': 'Edit client records',
  'clients.create': 'Create client records',

  'consultants.read': 'View consultants',
  'consultants.manage': 'Create and edit consultants',

  'sessions.read': 'View sessions',
  'sessions.read.own': 'View own sessions',
  'sessions.update': 'Update session outcomes',
  'sessions.notes': 'Read and write private consultation notes',

  'services.read': 'View services',
  'services.manage': 'Create and edit services',

  'payments.read': 'View payments',
  'payments.read.own': 'View own payments',
  'payments.refund': 'Issue refunds',
  'payments.manage': 'Record and adjust payments',

  'invoices.read': 'View invoices',
  'invoices.manage': 'Issue and void invoices',

  'reviews.read': 'View reviews',
  'reviews.moderate': 'Approve or reject reviews',
  'reviews.create': 'Submit reviews',

  'content.read': 'View unpublished content',
  'content.create': 'Draft articles and journal entries',
  'content.publish': 'Publish content',

  'products.read': 'View products',
  'products.manage': 'Create and edit products',
  'orders.read': 'View orders',
  'orders.manage': 'Fulfil and refund orders',

  'analytics.read': 'View analytics and reports',
  'audit.read': 'Inspect audit logs',
  'emails.read': 'Inspect email delivery logs',

  'users.manage': 'Create users and assign roles',
  'settings.manage': 'Change platform settings',
  /**
   * Separate from `settings.manage` on purpose. Renaming the platform or
   * swapping its logo is a day-to-day editorial job; changing payment
   * configuration is not. An administrator gets the first and not the second.
   */
  'branding.manage': 'Change the platform name, logo and favicon',
  'discounts.read': 'View discount codes',
  'discounts.manage': 'Create and withdraw discount codes',
  'content.delete': 'Permanently delete archived records',
  'integrations.manage': 'Connect and configure integrations',
  'availability.manage': 'Edit consultant availability',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_VALUES = Object.keys(PERMISSIONS) as Permission[];

const ALL: Permission[] = PERMISSION_VALUES;

const ADMIN_PERMISSIONS: Permission[] = ALL.filter((p) => p !== 'settings.manage');

/**
 * A consultant's reach is deliberately narrow.
 *
 * Everything they need is served by a route that scopes on their own profile id
 * (`/api/consultant/*`), so none of the broad forms belong here. `clients.read`,
 * `invoices.read` and `analytics.read` would each have handed a consultant the
 * whole practice through the admin API: every client's contact details and
 * internal notes, every invoice, and firm-wide revenue.
 */
const CONSULTANT_PERMISSIONS: Permission[] = [
  'appointments.read.own',
  'appointments.reschedule',
  'appointments.cancel',
  'appointments.create',
  'clients.read.own',
  'consultants.read',
  'sessions.read.own',
  'sessions.update',
  'sessions.notes',
  'services.read',
  'payments.read.own',
  'reviews.read',
  'availability.manage',
];

const CLIENT_PERMISSIONS: Permission[] = [
  'appointments.read.own',
  'appointments.create',
  'sessions.read.own',
  'payments.read.own',
  'reviews.create',
  'services.read',
  'consultants.read',
  'products.read',
];

const CONTENT_MANAGER_PERMISSIONS: Permission[] = [
  'content.read',
  'content.create',
  'content.publish',
  'content.delete',
  'products.read',
  'products.manage',
  'services.read',
  'consultants.read',
  'reviews.read',
  'reviews.moderate',
  'analytics.read',
];

const FINANCE_MANAGER_PERMISSIONS: Permission[] = [
  'payments.read',
  'payments.refund',
  'payments.manage',
  'invoices.read',
  'invoices.manage',
  'orders.read',
  'orders.manage',
  'discounts.read',
  'discounts.manage',
  'appointments.read',
  'clients.read',
  'consultants.read',
  'services.read',
  'analytics.read',
  'audit.read',
];

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [ROLES.SUPER_ADMIN]: ALL,
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.CONSULTANT]: CONSULTANT_PERMISSIONS,
  [ROLES.CLIENT]: CLIENT_PERMISSIONS,
  [ROLES.CONTENT_MANAGER]: CONTENT_MANAGER_PERMISSIONS,
  [ROLES.FINANCE_MANAGER]: FINANCE_MANAGER_PERMISSIONS,
};

/**
 * Some permissions come in a broad/own pair. Holding the broad form implies the
 * scoped form, so a check for `sessions.read.own` succeeds for an admin who
 * only holds `sessions.read`.
 */
export const PERMISSION_IMPLIES: Readonly<Partial<Record<Permission, readonly Permission[]>>> = {
  'appointments.read': ['appointments.read.own'],
  'sessions.read': ['sessions.read.own'],
  'payments.read': ['payments.read.own'],
  'clients.read': ['clients.read.own'],
};

/** Expand a permission set with everything those permissions imply. */
export function expandPermissions(granted: Iterable<Permission>): Set<Permission> {
  const out = new Set<Permission>();
  for (const permission of granted) {
    out.add(permission);
    for (const implied of PERMISSION_IMPLIES[permission] ?? []) out.add(implied);
  }
  return out;
}
