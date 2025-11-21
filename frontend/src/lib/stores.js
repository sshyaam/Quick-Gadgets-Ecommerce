import { writable } from 'svelte/store';

// User store
export const user = writable(null);

// Cart store
export const cart = writable(null);

// Loading state
export const loading = writable(false);

// Error store
export const error = writable(null);

