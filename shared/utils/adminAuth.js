/**
 * Admin authorization utilities
 * Used across workers to check if a user is an admin
 */

import { AuthenticationError, AuthorizationError } from './errors.js';

/**
 * Authenticate request and check if user is admin
 * This function fetches user profile from auth worker to check admin status
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment variables (must have auth worker binding)
 * @returns {Promise<Object>} User data with admin status
 */
export async function authenticateAdmin(request, env) {
  // First authenticate the user
  const authResult = await authenticateUser(request, env);
  
  if (!authResult.user) {
    throw new AuthenticationError('Authentication required');
  }
  
  // Check if user is admin
  if (!authResult.user.isAdmin) {
    throw new AuthorizationError('Admin access required');
  }
  
  return {
    user: authResult.user,
    userId: authResult.user.userId || authResult.userId,
  };
}

/**
 * Authenticate user (basic auth check)
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment variables
 * @returns {Promise<Object>} User data
 */
async function authenticateUser(request, env) {
  // Get access token from Authorization header or cookies
  let accessToken = null;
  
  // Try Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7);
  }
  
  // Try cookies
  if (!accessToken) {
    const cookies = request.headers.get('Cookie') || '';
    const cookieMatch = cookies.match(/accessToken=([^;]+)/);
    if (cookieMatch) {
      accessToken = cookieMatch[1];
    }
  }
  
  if (!accessToken) {
    throw new AuthenticationError('Access token required');
  }
  
  // Verify token with auth worker
  try {
    // Try service binding first, fallback to HTTP fetch
    let profile;
    const authUrl = env.AUTH_WORKER_URL || 'https://auth-worker.shyaamdps.workers.dev';
    
    // Try service binding if available
    if (env.auth_worker || env.AUTH_WORKER) {
      try {
        const authWorker = env.auth_worker || env.AUTH_WORKER;
        // When using service bindings, use any URL - the path matters, not the hostname
        const authResponse = await authWorker.fetch('https://workers.dev/profile', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Cookie': request.headers.get('Cookie') || '',
          },
        });
        
        if (authResponse.ok) {
          profile = await authResponse.json();
        } else {
          // Service binding failed, try HTTP fallback
          console.warn('[adminAuth] Service binding failed, falling back to HTTP:', authResponse.status);
          throw new Error('Service binding failed');
        }
      } catch (bindingError) {
        // Service binding failed, use HTTP fallback
        console.warn('[adminAuth] Service binding error, using HTTP fallback:', bindingError.message);
        const authResponse = await fetch(`${authUrl}/profile`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Cookie': request.headers.get('Cookie') || '',
          },
        });
        
        if (!authResponse.ok) {
          const errorText = await authResponse.text().catch(() => 'Unknown error');
          console.error('[adminAuth] Auth worker HTTP response error:', authResponse.status, errorText);
          throw new AuthenticationError('Invalid or expired access token');
        }
        
        profile = await authResponse.json();
      }
    } else {
      // No service binding, use HTTP fetch directly
      const authResponse = await fetch(`${authUrl}/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': request.headers.get('Cookie') || '',
        },
      });
      
      if (!authResponse.ok) {
        const errorText = await authResponse.text().catch(() => 'Unknown error');
        console.error('[adminAuth] Auth worker HTTP response error:', authResponse.status, errorText);
        throw new AuthenticationError('Invalid or expired access token');
      }
      
      profile = await authResponse.json();
    }
    
    if (!profile) {
      throw new AuthenticationError('Failed to get user profile');
    }
    
    return {
      user: profile,
      userId: profile.userId,
    };
  } catch (error) {
    console.error('[adminAuth] Error authenticating user:', error.message, error.stack);
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      throw error;
    }
    // Wrap unexpected errors as authentication errors for security
    throw new AuthenticationError('Authentication failed');
  }
}

/**
 * Authenticate user and check admin status (returns admin flag without throwing)
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment variables
 * @returns {Promise<Object>} User data with admin status (may not be admin)
 */
export async function authenticateUserForAdminCheck(request, env) {
  try {
    const result = await authenticateUser(request, env);
    return {
      ...result,
      isAdmin: result.user?.isAdmin === true,
    };
  } catch (error) {
    return {
      user: null,
      userId: null,
      isAdmin: false,
    };
  }
}

