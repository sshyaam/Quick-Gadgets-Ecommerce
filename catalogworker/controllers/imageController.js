/**
 * Image controller for handling product image uploads and serving
 */

import { authenticateAdmin } from '../../shared/utils/adminAuth.js';
import { ValidationError } from '../../shared/utils/errors.js';
import { randomUUID } from 'crypto';

/**
 * Upload product image to R2
 */
export async function uploadImage(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('image');

  if (!file || !(file instanceof File)) {
    throw new ValidationError('No image file provided');
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new ValidationError('File must be an image');
  }

  // Validate file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new ValidationError('Image size must be less than 5MB');
  }

  // Generate unique filename
  const fileExtension = file.name.split('.').pop() || 'jpg';
  const filename = `${randomUUID()}.${fileExtension}`;
  const objectKey = `products/${filename}`;

  // Convert file to array buffer
  const arrayBuffer = await file.arrayBuffer();

  // Upload to R2
  try {
    await env.product_images.put(objectKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Generate public URL
    const imageUrl = `${env.CATALOG_WORKER_URL || 'https://catalog-worker.shyaamdps.workers.dev'}/images/${objectKey}`;

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        objectKey,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[imageController] Error uploading image:', error);
    throw new Error('Failed to upload image to R2');
  }
}

/**
 * Serve image from R2
 */
export async function serveImage(request, env) {
  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/\/images\/(.+)/);
  
  if (!pathMatch) {
    return new Response('Invalid image path', { status: 400 });
  }

  const objectKey = pathMatch[1];

  try {
    // Security: Only allow access to product images
    if (!objectKey.startsWith('products/')) {
      return new Response('Access denied', { status: 403 });
    }

    // Get object from R2
    const object = await env.product_images.get(objectKey);

    if (!object) {
      return new Response('Image not found', { status: 404 });
    }

    // Get content type from metadata or default to image/jpeg
    const contentType = object.httpMetadata?.contentType || 'image/jpeg';

    // Return image with appropriate headers
    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error('[imageController] Error serving image:', error);
    return new Response('Error serving image', { status: 500 });
  }
}

/**
 * Delete image from R2
 */
export async function deleteImage(request, env) {
  // Authenticate admin
  const authResult = await authenticateAdmin(request, env);
  if (authResult instanceof Response) {
    return authResult;
  }

  const url = new URL(request.url);
  // Handle both /admin/images/products/... and /images/products/... patterns
  const pathMatch = url.pathname.match(/\/images\/(.+)/) || url.pathname.match(/\/admin\/images\/(.+)/);
  
  if (!pathMatch) {
    throw new ValidationError('Invalid image path');
  }

  const objectKey = pathMatch[1];

  // Security: Only allow deletion of product images
  if (!objectKey.startsWith('products/')) {
    throw new ValidationError('Access denied');
  }

  try {
    await env.product_images.delete(objectKey);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Image deleted successfully',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[imageController] Error deleting image:', error);
    throw new Error('Failed to delete image from R2');
  }
}

