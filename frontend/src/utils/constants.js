/**
 * AquaGuard — Global constants
 * All URLs are read from environment variables.
 * Never hardcode http://localhost:5000 here or anywhere else (Rule R6-H).
 */

export const API_BASE_URL = process.env.REACT_APP_API_URL || '';
export const WS_URL = process.env.REACT_APP_WS_URL;
