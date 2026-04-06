/**
 * AquaGuard — RequireRole component
 *
 * Conditionally renders children based on user role.
 * Renders fallback content (or nothing) if user lacks required role.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';

/**
 * @param {object} props
 * @param {string} props.role - Required role to render children
 * @param {React.ReactNode} props.children - Content to render if user has role
 * @param {React.ReactNode} [props.fallback=null] - Content to render if user lacks role
 */
function RequireRole({ role, children, fallback = null }) {
  const { hasRole } = useAuth();

  if (hasRole(role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

RequireRole.propTypes = {
  role: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
};

export default RequireRole;
