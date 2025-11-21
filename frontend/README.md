# E-Commerce Frontend (SvelteKit)

This is the frontend application for the E-Commerce Wholesale platform, built with SvelteKit and TailwindCSS.

## Features

- **Server-Side Rendering (SSR)** for all pages
- **Catalog Page**: Browse products with pagination, search, and filtering
- **Product Page**: View individual product details with ratings
- **Cart Page**: Manage shopping cart items
- **Orders Page**: View order history grouped by delivery date
- **Authentication**: Login and signup pages
- **Responsive Design**: Built with TailwindCSS

## Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Update worker URLs in `src/lib/api.js` if needed (currently set to `shyaamdps.workers.dev`)

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

5. Preview production build:
```bash
npm run preview
```

## Pages

- `/` - Home page
- `/catalog` - Product catalog with pagination
- `/product/[productId]` - Individual product page
- `/cart` - Shopping cart
- `/orders` - Order history
- `/login` - User login
- `/signup` - User registration
- `/checkout` - Checkout page (PayPal integration pending)

## Notes

- Authentication uses cookies (accessToken and refreshToken) set by the auth worker
- All API calls are made to the deployed Cloudflare Workers
- PayPal integration is pending configuration
- The frontend expects the backend workers to be deployed and accessible

