/**
 * Unit tests for permissions utility functions
 */

import {
  ROLES,
  isAdmin,
  isLifeguard,
  hasRole,
  CAN_MANAGE_CAMERAS,
  canManageCameras,
} from '../../utils/permissions';

describe('permissions utilities', () => {
  describe('ROLES constants', () => {
    it('defines ADMIN role', () => {
      expect(ROLES.ADMIN).toBe('admin');
    });

    it('defines LIFEGUARD role', () => {
      expect(ROLES.LIFEGUARD).toBe('lifeguard');
    });
  });

  describe('isAdmin', () => {
    it('returns true for admin user', () => {
      const user = { role: 'admin' };
      expect(isAdmin(user)).toBe(true);
    });

    it('returns false for lifeguard user', () => {
      const user = { role: 'lifeguard' };
      expect(isAdmin(user)).toBe(false);
    });

    it('returns false for null user', () => {
      expect(isAdmin(null)).toBe(false);
    });

    it('returns false for undefined user', () => {
      expect(isAdmin(undefined)).toBe(false);
    });

    it('returns false for user without role', () => {
      const user = { username: 'test' };
      expect(isAdmin(user)).toBe(false);
    });
  });

  describe('isLifeguard', () => {
    it('returns true for lifeguard user', () => {
      const user = { role: 'lifeguard' };
      expect(isLifeguard(user)).toBe(true);
    });

    it('returns false for admin user', () => {
      const user = { role: 'admin' };
      expect(isLifeguard(user)).toBe(false);
    });

    it('returns false for null user', () => {
      expect(isLifeguard(null)).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('returns true when user has matching role', () => {
      const user = { role: 'admin' };
      expect(hasRole(user, 'admin')).toBe(true);
    });

    it('returns false when user has different role', () => {
      const user = { role: 'lifeguard' };
      expect(hasRole(user, 'admin')).toBe(false);
    });

    it('returns false for null user', () => {
      expect(hasRole(null, 'admin')).toBe(false);
    });
  });

  describe('CAN_MANAGE_CAMERAS', () => {
    it('includes admin role', () => {
      expect(CAN_MANAGE_CAMERAS).toContain('admin');
    });

    it('does not include lifeguard role', () => {
      expect(CAN_MANAGE_CAMERAS).not.toContain('lifeguard');
    });
  });

  describe('canManageCameras', () => {
    it('returns true for admin user', () => {
      const user = { role: 'admin' };
      expect(canManageCameras(user)).toBe(true);
    });

    it('returns false for lifeguard user', () => {
      const user = { role: 'lifeguard' };
      expect(canManageCameras(user)).toBe(false);
    });

    it('returns false for null user', () => {
      expect(canManageCameras(null)).toBe(false);
    });

    it('returns false for undefined user', () => {
      expect(canManageCameras(undefined)).toBe(false);
    });
  });
});
