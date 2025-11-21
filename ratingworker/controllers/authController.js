/**
 * Authentication controller for rating worker
 */

import jwt from 'jsonwebtoken';
import { getWorkerBinding } from '../../shared/utils/interWorker.js';
import { AuthenticationError } from '../../shared/utils/errors.js';

/**
 * Authentication middleware for user requests
 */
export async function authenticate(request, env) {
  try {
    // Get access token from cookie or Authorization header (fallback)
    const cookies = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';
    
    // Parse cookies more robustly - handle URL encoding and whitespace
    let accessToken = null;
    
    // Try Authorization header first (localStorage fallback)
    if (authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7).trim();
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
          break;
        }
      }
    }

    if (!accessToken) {
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

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(accessToken, env.ENCRYPTION_KEY);
    } catch (error) {
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
      console.error('[rating-worker] Session verification error:', error.message);
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
    
    // Return null to continue to next handler
    return null;
  } catch (error) {
    console.error('[rating-worker] Authentication error:', error.message);
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

