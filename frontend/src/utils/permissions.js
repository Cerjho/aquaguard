/**
 * AquaGuard — Role-based permissions utilities
 *
 * Provides role constants and permission check functions for
 * consistent access control across the frontend.
 */

export const ROLES = {
  ADMIN: 'admin',
  LIFEGUARD: 'lifeguard',
};

/**
 * Check if user has the admin role.
 * @param {object|null} user - User object with role property
 * @returns {boolean}
 */
export const isAdmin = (user) => user?.role === ROLES.ADMIN;

/**
 * Check if user has the lifeguard role.
 * @param {object|null} user - User object with role property
 * @returns {boolean}
 */
export const isLifeguard = (user) => user?.role === ROLES.LIFEGUARD;

/**
 * Check if user has a specific role.
 * @param {object|null} user - User object with role property
 * @param {string} role - Role to check against
 * @returns {boolean}
 */
export const hasRole = (user, role) => user?.role === role;

/**
 * Roles that can manage cameras (add, edit, deactivate).
 */
export const CAN_MANAGE_CAMERAS = [ROLES.ADMIN];

/**
 * Check if user can manage cameras.
 * @param {object|null} user - User object with role property
 * @returns {boolean}
 */
export const canManageCameras = (user) => CAN_MANAGE_CAMERAS.includes(user?.role);
