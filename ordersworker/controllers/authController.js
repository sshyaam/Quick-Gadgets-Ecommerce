/**
 * Authentication controller for orders worker
 */

import { getWorkerBinding } from '../../shared/utils/interWorker.js';
import { AuthenticationError } from '../../shared/utils/errors.js';
import jwt from 'jsonwebtoken';

/**
 * Authentication middleware
 */
export async function authenticate(request, env) {
  try {
    // Get access token from cookie or Authorization header (fallback)
    const cookies = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';
    
    console.log('[orders-worker] Authenticate - Cookies:', cookies ? 'present' : 'missing');
    console.log('[orders-worker] Authorization header:', authHeader ? 'present' : 'missing');
    
    // Parse cookies more robustly - handle URL encoding and whitespace
    let accessToken = null;
    
    // Try Authorization header first (localStorage fallback)
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7).trim();
      console.log('[orders-worker] Using token from Authorization header');
    } else {
      // Try cookies
      const cookieParts = cookies.split(';');
      for (const part of cookieParts) {
        const trimmed = part.trim();
        if (trimmed.startsWith('accessToken=')) {
          accessToken = trimmed.substring('accessToken='.length).trim();
          // Decode if URL encoded
          try {
            accessToken = decodeURIComponent(accessToken);
          } catch (e) {
            // If decoding fails, use as-is
          }
          console.log('[orders-worker] Using token from Cookie header');
          break;
        }
      }
    }

    if (!accessToken) {
      console.log('[orders-worker] No access token found in cookies');
      console.log('[orders-worker] Cookie header:', cookies.substring(0, 100));
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Access token required. Please log in.',
          },
        }),
        {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
          },
        }
      );
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(accessToken, env.ENCRYPTION_KEY);
    } catch (error) {
      console.log('[orders-worker] Token verification failed:', error.message);
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid or expired access token. Please log in again.',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify session with auth worker using Service Binding
    try {
      const sessionResponse = await getWorkerBinding(
        env.auth_worker,
        `/session/${decoded.sessionId}`,
        {},
        env.INTER_WORKER_API_KEY
      );

      if (!sessionResponse.ok) {
        console.log('[orders-worker] Session verification failed');
        return new Response(
          JSON.stringify({
            error: {
              code: 'AUTHENTICATION_ERROR',
              message: 'Session not found or expired. Please log in again.',
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (error) {
      console.error('[orders-worker] Session verification error:', error.message);
      return new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Failed to verify session. Please log in again.',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Attach to request for use in handlers
    request.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    };
    
    console.log('[orders-worker] Authentication successful for user:', decoded.userId);
    // Return null to continue to next handler
    return null;
  } catch (error) {
    console.error('[orders-worker] Authentication error:', error.message);
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

