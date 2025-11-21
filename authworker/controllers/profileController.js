/**
 * Profile controller
 */

import * as profileService from '../services/profileService.js';
import { updateProfileSchema, addressSchema } from '../validation/profileValidation.js';
import { ValidationError } from '../../shared/utils/errors.js';

/**
 * Get profile handler
 */
export async function getProfile(request, env) {
  const profile = await profileService.getProfile(
    request.user.userId,
    env.auth_db,
    env.ENCRYPTION_KEY
  );

  return new Response(
    JSON.stringify(profile),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update profile handler
 */
export async function updateProfile(request, env) {
  const body = await request.json();
  
  // Validate
  const { error, value } = updateProfileSchema.validate(body);
  if (error) {
    throw new ValidationError(error.details[0].message, error.details);
  }

  const updated = await profileService.updateProfile(
    request.user.userId,
    value,
    env.auth_db,
    env.ENCRYPTION_KEY
  );

  return new Response(
    JSON.stringify(updated),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update password handler
 */
export async function updatePassword(request, env) {
  const body = await request.json();
  const { password } = body;
  
  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }
  
  await profileService.updatePassword(
    request.user.userId,
    password,
    env.auth_db,
    env.ENCRYPTION_KEY
  );
  
  return new Response(
    JSON.stringify({ success: true, message: 'Password updated successfully' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Add saved address handler
 */
export async function addSavedAddress(request, env) {
  const body = await request.json();
  
  // Validate address using addressSchema (with required fields)
  const { error, value } = addressSchema.validate(body);
  if (error) {
    const errorMessage = error.details.map(d => d.message).join(', ');
    throw new ValidationError(errorMessage, error.details);
  }

  const updated = await profileService.addSavedAddress(
    request.user.userId,
    value,
    env.auth_db,
    env.ENCRYPTION_KEY
  );

  return new Response(
    JSON.stringify(updated),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update saved address handler
 */
export async function updateSavedAddress(request, env) {
  const { addressId } = request.params;
  const body = await request.json();
  
  // Validate address using addressSchema (with required fields)
  const { error, value } = addressSchema.validate(body);
  if (error) {
    const errorMessage = error.details.map(d => d.message).join(', ');
    throw new ValidationError(errorMessage, error.details);
  }

  const updated = await profileService.updateSavedAddress(
    request.user.userId,
    addressId,
    value,
    env.auth_db,
    env.ENCRYPTION_KEY
  );

  return new Response(
    JSON.stringify(updated),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Delete saved address handler
 */
export async function deleteSavedAddress(request, env) {
  const { addressId } = request.params;

  const updated = await profileService.deleteSavedAddress(
    request.user.userId,
    addressId,
    env.auth_db,
    env.ENCRYPTION_KEY
  );

  return new Response(
    JSON.stringify(updated),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Get user by ID (inter-worker)
 */
export async function getUserById(request, env) {
  const { userId } = request.params;
  
  const profile = await profileService.getProfile(
    userId,
    env.auth_db,
    env.ENCRYPTION_KEY
  );

  return new Response(
    JSON.stringify(profile),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

