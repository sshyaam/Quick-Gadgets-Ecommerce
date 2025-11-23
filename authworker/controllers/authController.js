/**
 * Authentication controller
 */

import * as authService from '../services/authService.js';
import * as profileService from '../services/profileService.js';
import { validateApiKey } from '../../shared/utils/interWorker.js';
import { AuthenticationError, ValidationError, ConflictError } from '../../shared/utils/errors.js';
import { signupSchema, loginSchema } from '../validation/authValidation.js';
import { sendLog } from '../../shared/utils/logger.js';

/**
 * Health check
 */
export async function healthCheck(request, env) {
  try {
    await env.auth_db.prepare('SELECT 1').first();
    
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'auth-worker',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        service: 'auth-worker',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Validate worker request (for inter-worker calls)
 */
export function validateWorkerRequest(request, env) {
  if (!validateApiKey(request, env.INTER_WORKER_API_KEY)) {
    throw new AuthenticationError('Invalid API key for inter-worker request');
  }
}

/**
 * Authentication middleware
 */
export async function authenticate(request, env) {
  try {
    // Get access token from cookie or Authorization header (fallback)
    const cookies = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';
    
    console.log('[auth-worker] Authenticate - Cookies:', cookies ? 'present' : 'missing');
    console.log('[auth-worker] Authorization header:', authHeader ? 'present' : 'missing');
    
    let accessToken = null;
    
    // Try Authorization header first (localStorage fallback)
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7).trim();
      console.log('[auth-worker] Using token from Authorization header');
    } else {
      // Try cookies
      const cookieMatch = cookies.match(/accessToken=([^;]+)/);
      accessToken = cookieMatch ? cookieMatch[1] : null;
      if (accessToken) {
        console.log('[auth-worker] Using token from Cookie header');
      }
    }

    if (!accessToken) {
      console.log('[auth-worker] No access token found in cookies');
      // Return error response instead of throwing
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Access token required. Please log in.',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[auth-worker] Access token found, verifying...');
    const authData = await authService.authenticate(
      accessToken,
      env.auth_db,
      env.ENCRYPTION_KEY
    );

    console.log('[auth-worker] Authentication successful for user:', authData.userId);
    request.user = authData;
    // Return null/undefined to continue to next handler
    return null;
  } catch (error) {
    console.error('[auth-worker] Authentication error:', error.message);
    // Return error response
    return new Response(
      JSON.stringify({
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: error.message || 'Authentication failed',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Sign up handler
 */
export async function signup(request, env, ctx) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    const body = await request.json();
    
    // Debug: Signup request received
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Signup request received',
      {
        worker: 'auth-worker',
        email: body.email,
      },
      apiKey,
      ctx,
      request
    );
    
    const { error, value } = signupSchema.validate(body);
    if (error) {
      // Error: Validation failed
      await sendLog(
        logWorkerBindingOrUrl,
        'error',
        'Signup validation failed',
        {
          worker: 'auth-worker',
          error: error.details[0].message,
          email: body.email,
        },
        apiKey,
        ctx,
        request
      );
      throw new ValidationError(error.details[0].message, error.details);
    }

    // Debug: Starting signup process
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Starting signup process',
      {
        worker: 'auth-worker',
        email: value.email,
      },
      apiKey,
      ctx,
      request
    );
    
    const result = await authService.signup(
      value,
      env.auth_db,
      env.ENCRYPTION_KEY,
      logWorkerBindingOrUrl,
      apiKey,
      ctx // Pass execution context for ctx.waitUntil
    );
    
    // Event: Signup successful (service layer also logs, but controller logs with more context)
    await sendLog(
      logWorkerBindingOrUrl,
      'event',
      'User signup completed',
      {
        worker: 'auth-worker',
        userId: result.userId,
        email: value.email,
      },
      apiKey,
      ctx,
      request
    );

  // Determine cookie settings based on origin
  const origin = request.headers.get('Origin') || '';
  const isSecure = request.url.startsWith('https://');
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
  
  // For cross-origin requests, use SameSite=None with Secure
  let secureFlag = '';
  let sameSite = 'SameSite=None';
  
  if (isLocalhost) {
    // For localhost development with cross-origin: use None with Secure
    sameSite = 'SameSite=None';
    secureFlag = 'Secure;';
  } else if (isSecure) {
    // Production HTTPS: use None with Secure for cross-origin
    sameSite = 'SameSite=None';
    secureFlag = 'Secure;';
  } else {
    // HTTP (shouldn't happen in production): use Lax
    sameSite = 'SameSite=Lax';
    secureFlag = '';
  }
  
  // Create response - include tokens in body for localStorage fallback
  const response = new Response(
    JSON.stringify({
      userId: result.userId,
      sessionId: result.sessionId,
      // Include tokens in response for localStorage fallback (if cookies don't work)
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    }),
    {
      status: 201,
      headers: { 
        'Content-Type': 'application/json',
      },
    }
  );

  // Set cookies with proper flags
  // For localhost: don't set Domain (browser will use request domain)
  // For production: set Domain to share across worker subdomains
  let domain = '';
  if (!isLocalhost) {
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;
      // Extract domain like .shyaamdps.workers.dev from auth-worker.shyaamdps.workers.dev
      const parts = hostname.split('.');
      if (parts.length >= 3) {
        // Take last 3 parts: shyaamdps.workers.dev -> .shyaamdps.workers.dev
        domain = `Domain=.${parts.slice(-3).join('.')}; `;
      }
    } catch (e) {
      console.error('[auth-worker] Error extracting domain:', e.message);
    }
  }
  
  // Build cookie options string
  let cookieOptions = '';
  if (domain) {
    cookieOptions += domain;
  }
  cookieOptions += 'HttpOnly; ';
  if (secureFlag) {
    cookieOptions += secureFlag;
  }
  cookieOptions += `${sameSite}; Path=/`;
  
  console.log('[auth-worker] Signup cookie options:', cookieOptions);
  
  // Set cookies explicitly - use append to ensure all cookies are set
  response.headers.append('Set-Cookie', `accessToken=${result.accessToken}; ${cookieOptions}; Max-Age=900`);
  response.headers.append('Set-Cookie', `refreshToken=${result.refreshToken}; ${cookieOptions}; Max-Age=604800`);
  response.headers.append('Set-Cookie', `sessionId=${result.sessionId}; ${cookieOptions}; Max-Age=604800`);

  console.log('[auth-worker] Signup cookies set');
  return response;
  } catch (error) {
    // Error: Signup failed
    await sendLog(
      logWorkerBindingOrUrl,
      'error',
      'Signup failed',
      {
        worker: 'auth-worker',
        error: error.message,
        errorType: error.name || 'UnknownError',
      },
      apiKey,
      ctx,
      request
    );
    throw error;
  }
}

/**
 * Login handler
 */
export async function login(request, env, ctx) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    const body = await request.json();
    console.log('[auth-worker] Login request received for:', body.email);
    
    // Debug: Login request received
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Login request received',
      {
        worker: 'auth-worker',
        email: body.email,
      },
      apiKey,
      ctx,
      request
    );
    
    const { error, value } = loginSchema.validate(body);
    if (error) {
      console.log('[auth-worker] Validation error:', error.details[0].message);
      // Error: Validation failed
      await sendLog(
        logWorkerBindingOrUrl,
        'error',
        'Login validation failed',
        {
          worker: 'auth-worker',
          error: error.details[0].message,
          email: body.email,
        },
        apiKey,
        ctx,
        request
      );
      throw new ValidationError(error.details[0].message, error.details);
    }

    console.log('[auth-worker] Attempting login for email:', value.email);
    
    // Debug: Starting login process
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Starting login process',
      {
        worker: 'auth-worker',
        email: value.email,
      },
      apiKey,
      ctx,
      request
    );
    
    const result = await authService.login(
      value.email,
      value.password,
      env.auth_db,
      env.ENCRYPTION_KEY,
      logWorkerBindingOrUrl,
      apiKey,
      ctx // Pass execution context for ctx.waitUntil
    );

    console.log('[auth-worker] Login successful for user:', result.userId);
    
    // Event: Login successful (service layer also logs, but controller logs with more context)
    await sendLog(
      logWorkerBindingOrUrl,
      'event',
      'User login completed',
      {
        worker: 'auth-worker',
        userId: result.userId,
        email: value.email,
      },
      apiKey,
      ctx,
      request
    );

    // Determine cookie settings based on origin
    const origin = request.headers.get('Origin') || '';
    const isSecure = request.url.startsWith('https://');
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    
    // For cross-origin requests (localhost HTTP -> HTTPS workers.dev), we need SameSite=None
    // But SameSite=None requires Secure, which won't work from HTTP localhost
    // Solution: Use SameSite=None with Secure for localhost too (browsers allow this for localhost)
    // OR: Don't use HttpOnly for localhost so frontend can read and store in localStorage
    let secureFlag = '';
    let sameSite = 'SameSite=None';
    
    if (isLocalhost) {
      // For localhost development with cross-origin: use None with Secure
      // Modern browsers allow Secure cookies from HTTP localhost for development
      sameSite = 'SameSite=None';
      secureFlag = 'Secure;'; // Required for SameSite=None, but browsers allow this for localhost
    } else if (isSecure) {
      // Production HTTPS: use None with Secure for cross-origin
      sameSite = 'SameSite=None';
      secureFlag = 'Secure;';
    } else {
      // HTTP (shouldn't happen in production): use Lax
      sameSite = 'SameSite=Lax';
      secureFlag = '';
    }
    
    // Create response - include tokens in body for localStorage fallback
    const response = new Response(
      JSON.stringify({
        userId: result.userId,
        sessionId: result.sessionId,
        // Include tokens in response for localStorage fallback (if cookies don't work)
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
        },
      }
    );

    // Set cookies with proper flags
    // For localhost: don't set Domain (browser will use request domain)
    // For production: set Domain to share across worker subdomains
    let domain = '';
    if (!isLocalhost) {
      try {
        const url = new URL(request.url);
        const hostname = url.hostname;
        // Extract domain like .shyaamdps.workers.dev from auth-worker.shyaamdps.workers.dev
        const parts = hostname.split('.');
        if (parts.length >= 3) {
          // Take last 3 parts: shyaamdps.workers.dev -> .shyaamdps.workers.dev
          domain = `Domain=.${parts.slice(-3).join('.')}; `;
        }
      } catch (e) {
        console.error('[auth-worker] Error extracting domain:', e.message);
      }
    }
    
    // Build cookie options string
    // For localhost: HttpOnly; SameSite=Lax; Path=/
    // For production: Domain=...; HttpOnly; Secure; SameSite=None; Path=/
    let cookieOptions = '';
    if (domain) {
      cookieOptions += domain;
    }
    cookieOptions += 'HttpOnly; ';
    if (secureFlag) {
      cookieOptions += secureFlag;
    }
    cookieOptions += `${sameSite}; Path=/`;
    
    console.log('[auth-worker] Cookie options:', cookieOptions);
    console.log('[auth-worker] Setting cookies with domain:', domain || 'none (localhost)');
    
    // Set cookies explicitly - build full cookie strings
    const accessTokenCookie = `accessToken=${result.accessToken}; ${cookieOptions}; Max-Age=900`;
    const refreshTokenCookie = `refreshToken=${result.refreshToken}; ${cookieOptions}; Max-Age=604800`;
    const sessionIdCookie = `sessionId=${result.sessionId}; ${cookieOptions}; Max-Age=604800`;
    
    console.log('[auth-worker] Access token cookie:', accessTokenCookie.substring(0, 100));
    
    // Set cookies explicitly - use append to ensure all cookies are set
    response.headers.append('Set-Cookie', accessTokenCookie);
    response.headers.append('Set-Cookie', refreshTokenCookie);
    response.headers.append('Set-Cookie', sessionIdCookie);
    
    console.log('[auth-worker] Cookies appended to response');
    console.log('[auth-worker] Response headers Set-Cookie count:', response.headers.get('Set-Cookie') ? 'present' : 'missing');

    console.log('[auth-worker] Login response created with cookies');
    console.log('[auth-worker] Cookies set:', {
      accessToken: result.accessToken ? 'present' : 'missing',
      refreshToken: result.refreshToken ? 'present' : 'missing',
      sessionId: result.sessionId ? 'present' : 'missing',
    });
    
    return response;
  } catch (error) {
    console.error('[auth-worker] Login error:', error.message);
    
    // Error: Login failed
    await sendLog(
      logWorkerBindingOrUrl,
      'error',
      'Login failed',
      {
        worker: 'auth-worker',
        error: error.message,
        errorType: error.name || 'UnknownError',
        // Don't log email/password for security
      },
      apiKey,
      ctx,
      request
    );
    
    // Re-throw to let error handler deal with it
    throw error;
  }
}

/**
 * Refresh token handler
 */
export async function refreshToken(request, env, ctx) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    // Debug: Refresh token request received
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Refresh token request received',
      {
        worker: 'auth-worker',
      },
      apiKey,
      ctx,
      request
    );
    
    let refreshToken = null;
    
    // Try to get refresh token from multiple sources
    // 1. Request body (for programmatic access)
    try {
      const body = await request.clone().json().catch(() => ({}));
      if (body.refreshToken) {
        refreshToken = body.refreshToken;
        console.log('[auth-worker] Refresh token from request body');
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
    
    // 2. Cookies (primary method)
    if (!refreshToken) {
      const cookies = request.headers.get('Cookie') || '';
      console.log('[auth-worker] Cookies received:', cookies ? 'present' : 'missing');
      
      // Extract refresh token - handle multiple cookies with same name
      // Split by semicolon and find refreshToken
      const cookieParts = cookies.split(';').map(c => c.trim());
      const refreshTokenCookies = cookieParts.filter(c => c.startsWith('refreshToken='));
      
      if (refreshTokenCookies.length > 0) {
        // Get the last one (most recent)
        const lastCookie = refreshTokenCookies[refreshTokenCookies.length - 1];
        refreshToken = lastCookie.substring('refreshToken='.length);
        console.log('[auth-worker] Refresh token from cookie (found', refreshTokenCookies.length, 'cookie(s))');
      }
    }

    if (!refreshToken) {
      console.error('[auth-worker] No refresh token found in request');
      // Error: No refresh token
      await sendLog(
        logWorkerBindingOrUrl,
        'error',
        'Refresh token not found',
        {
          worker: 'auth-worker',
          error: 'Refresh token required',
        },
        apiKey,
        ctx,
        request
      );
      throw new AuthenticationError('Refresh token required');
    }

    console.log('[auth-worker] Refresh token request - token length:', refreshToken.length);
    console.log('[auth-worker] Refresh token (first 20 chars):', refreshToken.substring(0, 20));
    
    // Debug: Starting token refresh
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Starting token refresh',
      {
        worker: 'auth-worker',
        tokenLength: refreshToken.length,
      },
      apiKey,
      ctx,
      request
    );

    const result = await authService.refreshAccessToken(
      refreshToken,
      env.auth_db,
      env.ENCRYPTION_KEY
    );

    console.log('[auth-worker] Refresh successful, setting new cookies');
    
    // Event: Token refresh successful
    await sendLog(
      logWorkerBindingOrUrl,
      'event',
      'Token refresh completed',
      {
        worker: 'auth-worker',
        userId: result.userId,
        sessionId: result.sessionId,
      },
      apiKey,
      ctx,
      request
    );

  // Determine cookie settings based on origin (match login/signup logic exactly)
  const origin = request.headers.get('Origin') || '';
  const isSecure = request.url.startsWith('https://');
  const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
  
  let secureFlag = '';
  let sameSite = 'SameSite=None';
  
  if (isLocalhost) {
    sameSite = 'SameSite=None';
    secureFlag = 'Secure;';
  } else if (isSecure) {
    sameSite = 'SameSite=None';
    secureFlag = 'Secure;';
  } else {
    sameSite = 'SameSite=Lax';
    secureFlag = '';
  }
  
  // Determine domain (match login/signup logic exactly)
  let domain = '';
  if (!isLocalhost) {
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;
      const parts = hostname.split('.');
      if (parts.length >= 3) {
        domain = `.${parts.slice(-3).join('.')}`;
      }
    } catch (e) {
      console.error('[auth-worker] Error extracting domain:', e.message);
    }
  }
  
  // Build cookie options string (match login/signup format exactly)
  let cookieOptions = '';
  if (domain) {
    cookieOptions += `Domain=${domain}; `;
  }
  cookieOptions += 'HttpOnly; ';
  if (secureFlag) {
    cookieOptions += secureFlag;
  }
  cookieOptions += `${sameSite}; Path=/`;

  console.log('[auth-worker] Cookie options:', cookieOptions);
  console.log('[auth-worker] Domain:', domain || 'none (localhost)');

  // Build response with tokens in body (for localStorage fallback) and cookies
  const response = new Response(
    JSON.stringify({ 
      success: true,
      accessToken: result.accessToken, // Include in body for localStorage
      refreshToken: result.refreshToken // Include in body for localStorage
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );

  // CRITICAL: Clear old cookies FIRST with exact same domain/path
  // Use multiple methods to ensure old cookies are removed
  const expiredDate = new Date(0).toUTCString();
  
  // Method 1: Clear with same domain/path
  if (domain) {
    response.headers.append('Set-Cookie', `accessToken=; Domain=${domain}; Path=/; HttpOnly; ${secureFlag}${sameSite}; Max-Age=0; Expires=${expiredDate}`);
    response.headers.append('Set-Cookie', `refreshToken=; Domain=${domain}; Path=/; HttpOnly; ${secureFlag}${sameSite}; Max-Age=0; Expires=${expiredDate}`);
  } else {
    // No domain (localhost) - clear without domain
    response.headers.append('Set-Cookie', `accessToken=; Path=/; HttpOnly; ${secureFlag}${sameSite}; Max-Age=0; Expires=${expiredDate}`);
    response.headers.append('Set-Cookie', `refreshToken=; Path=/; HttpOnly; ${secureFlag}${sameSite}; Max-Age=0; Expires=${expiredDate}`);
  }
  
  // Method 2: Also try clearing without domain (in case old cookie was set without domain)
  response.headers.append('Set-Cookie', `accessToken=; Path=/; Max-Age=0; Expires=${expiredDate}`);
  response.headers.append('Set-Cookie', `refreshToken=; Path=/; Max-Age=0; Expires=${expiredDate}`);
  
  // Then set new cookies with proper expiration
  response.headers.append('Set-Cookie', `accessToken=${result.accessToken}; ${cookieOptions}; Max-Age=900`);
  response.headers.append('Set-Cookie', `refreshToken=${result.refreshToken}; ${cookieOptions}; Max-Age=604800`);

  console.log('[auth-worker] Refresh cookies set successfully');
  console.log('[auth-worker] New access token (first 20 chars):', result.accessToken.substring(0, 20));
  console.log('[auth-worker] New refresh token (first 20 chars):', result.refreshToken.substring(0, 20));
  
  return response;
  } catch (error) {
    // Error: Token refresh failed
    await sendLog(
      logWorkerBindingOrUrl,
      'error',
      'Token refresh failed',
      {
        worker: 'auth-worker',
        error: error.message,
        errorType: error.name || 'UnknownError',
      },
      apiKey,
      ctx,
      request
    );
    throw error;
  }
}

/**
 * Set password for users without passwords (legacy users)
 * This allows users who were created before password storage to set a password
 */
export async function setPassword(request, env) {
  try {
    const body = await request.json();
    const { email, password } = body;
    
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Get user by email
    const user = await authService.getUserByEmailForPasswordReset(
      normalizedEmail,
      env.auth_db,
      env.ENCRYPTION_KEY
    );
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    // Check if user already has a password
    if (user.hasPassword) {
      throw new ConflictError('User already has a password set. Use the login endpoint.');
    }
    
    // Set the password
    await profileService.updatePassword(
      user.userId,
      password,
      env.auth_db,
      env.ENCRYPTION_KEY
    );
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Password set successfully. You can now login.' 
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[auth-worker] Set password error:', error.message);
    throw error;
  }
}

/**
 * Logout handler
 */
export async function logout(request, env, ctx) {
  const logWorkerBindingOrUrl = env.log_worker || env.LOG_WORKER_URL;
  const apiKey = env.INTER_WORKER_API_KEY;
  
  try {
    // Debug: Logout request received
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Logout request received',
      {
        worker: 'auth-worker',
      },
      apiKey,
      ctx,
      request
    );
    
    const cookies = request.headers.get('Cookie') || '';
    const cookieMatch = cookies.match(/sessionId=([^;]+)/);
    const sessionId = cookieMatch ? cookieMatch[1] : null;

    // Debug: Session ID extraction
    await sendLog(
      logWorkerBindingOrUrl,
      'debug',
      'Extracting session ID for logout',
      {
        worker: 'auth-worker',
        sessionIdFound: !!sessionId,
      },
      apiKey,
      ctx,
      request
    );

    let userId = null;
    if (sessionId) {
      // Get user ID from session before deleting it
      try {
        const { getSessionById } = await import('../models/sessionModel.js');
        const session = await getSessionById(env.auth_db, sessionId);
        if (session) {
          userId = session.userId;
        }
      } catch (e) {
        console.warn('[auth-worker] Could not get session for logging:', e.message);
      }
      
      await authService.logout(sessionId, env.auth_db);
    }

    // Event: Logout successful
    await sendLog(
      logWorkerBindingOrUrl,
      'event',
      'User logout completed',
      {
        worker: 'auth-worker',
        userId: userId,
        sessionId: sessionId,
      },
      apiKey,
      ctx,
      request
    );

    const response = new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    // Clear cookies
    const cookieOptions = 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
    response.headers.append('Set-Cookie', `accessToken=; ${cookieOptions}`);
    response.headers.append('Set-Cookie', `refreshToken=; ${cookieOptions}`);
    response.headers.append('Set-Cookie', `sessionId=; ${cookieOptions}`);

    return response;
  } catch (error) {
    // Error: Logout failed
    await sendLog(
      logWorkerBindingOrUrl,
      'error',
      'Logout failed',
      {
        worker: 'auth-worker',
        error: error.message,
        errorType: error.name || 'UnknownError',
      },
      apiKey,
      ctx,
      request
    );
    throw error;
  }
}

/**
 * Get session (inter-worker)
 */
export async function getSession(request, env) {
  const { sessionId } = request.params;
  
  const { getSessionById } = await import('../models/sessionModel.js');
  const session = await getSessionById(env.auth_db, sessionId);
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify(session),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
