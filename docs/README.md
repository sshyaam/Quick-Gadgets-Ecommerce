# E-Commerce Wholesale Application

A comprehensive e-commerce application built with Cloudflare Workers, implementing a microservices architecture for a wholesale electronics seller platform.

## Architecture

The application is split into multiple microservices (workers) for loose coupling:

1. **Auth Worker** - User authentication, sessions (hybrid Session ID + JWT), user profiles with encrypted PII
2. **Catalog Worker** - Product display, pagination, caching (KV + browser memory)
3. **Pricing Worker** - Price management
4. **Fulfillment Worker** - Shipping rules (stored in DB), inventory management
5. **Cart Worker** - Cart management with price/stock locking
6. **Payment Worker** - PayPal Sandbox integration, encrypted payment IDs
7. **Orders Worker** - Order storage, Saga pattern for distributed transactions
8. **Rating Worker** - Product ratings (one per completed order per product)
9. **Realtime Worker** - WebSocket order status updates via Durable Objects
10. **Log Worker** - Log aggregation and storage in R2 (batched per 100 logs)
11. **Health Check Worker** - Monitors all workers, D1, KV, and R2

## Key Features

- **Microservices Architecture**: Each worker has its own database (D1) to avoid tight coupling
- **No Foreign Keys**: Loose coupling between services
- **Soft Deletes**: Implemented for users, sessions, products, inventory, carts, and payments (not required for shipping rules, orders, prices, and ratings)
- **JSONB Storage**: User PII, product data, order data stored in JSONB format
- **JSON_EXTRACT Queries**: Efficient querying of JSONB fields
- **Price/Stock Locking**: Cart locks price and stock when items are added
- **Saga Pattern**: Distributed transaction management for order creation
- **WebSocket Support**: Real-time order status updates via Durable Objects
- **PayPal Sandbox**: Payment processing with encrypted payment IDs
- **Caching Strategy**: Product data cached in KV (price/stock not cached)
- **Log Batching**: Logs stored in R2, one object per 100 logs

## Technology Stack

- **Runtime**: Cloudflare Workers
- **Router**: itty-router
- **Language**: JavaScript (Node.js style)
- **Frontend**: SvelteKit (SSR for catalog, product, cart, orders pages)
- **Styling**: TailwindCSS
- **Database**: Cloudflare D1 (separate DB per worker)
- **Caching**: Cloudflare KV
- **Storage**: Cloudflare R2 (for logs)
- **WebSockets**: Cloudflare Durable Objects
- **Validation**: JOI
- **Testing**: Mocha + Chai
- **Payment**: PayPal Sandbox

## Project Structure

```
Ecom/
├── authworker/
│   ├── index.js
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   └── validation/
├── catalogworker/
├── pricingworker/
├── fulfillmentworker/
├── cartworker/
├── paymentworker/
├── ordersworker/
├── ratingworker/
├── realtimeworker/
│   └── durableObjects/
├── logworker/
├── healthcheckworker/
├── shared/
│   └── utils/
├── database-schemas/
└── package.json
```

## Database Schemas

Each worker has its own D1 database. See `database-schemas/` for SQL schemas:

- `auth.sql` - Users and sessions
- `catalog.sql` - Products (excluding price/stock)
- `pricing.sql` - Prices
- `fulfillment.sql` - Inventory and shipping rules
- `cart.sql` - Carts with locked prices/stocks
- `payment.sql` - Payment records with encrypted IDs
- `orders.sql` - Orders with user/address/product data
- `rating.sql` - Product ratings

## Environment Variables

Each worker requires the following environment variables. Most are set as `vars` in the wrangler.toml files:

### Common (Set as vars in all toml files)
- `INTER_WORKER_API_KEY` - API key for inter-worker communication (set to "ECOMSECRET" in all toml files)
- `ENCRYPTION_KEY` - Key for AES-256-GCM encryption (set to "ECOMSECRET" in auth, cart, payment, orders workers)
- `LOG_WORKER_URL` - URL of log worker

### Auth Worker
- `AUTH_DB` - D1 database binding
- `AUTH_WORKER_URL` - Auth worker URL (for other workers)

### Catalog Worker
- `CATALOG_DB` - D1 database binding
- `PRODUCT_CACHE` - KV namespace binding
- `PRICING_WORKER_URL` - Pricing worker URL
- `FULFILLMENT_WORKER_URL` - Fulfillment worker URL

### Pricing Worker
- `PRICING_DB` - D1 database binding

### Fulfillment Worker
- `FULFILLMENT_DB` - D1 database binding

### Cart Worker
- `CART_DB` - D1 database binding
- `AUTH_WORKER_URL` - Auth worker URL
- `PRICING_WORKER_URL` - Pricing worker URL
- `FULFILLMENT_WORKER_URL` - Fulfillment worker URL

### Payment Worker
- `PAYMENT_DB` - D1 database binding
- `ENCRYPTION_KEY` - Key for AES-256-GCM encryption (set as var)
- `PAYPAL_CLIENT_ID` - PayPal client ID (set as secret - see step 8)
- `PAYPAL_CLIENT_SECRET` - PayPal client secret (set as secret - see step 8)
- `PAYPAL_SANDBOX` - 'true' for sandbox mode (set as var)

### Orders Worker
- `ORDERS_DB` - D1 database binding
- `AUTH_WORKER_URL` - Auth worker URL
- `CART_WORKER_URL` - Cart worker URL
- `FULFILLMENT_WORKER_URL` - Fulfillment worker URL
- `PAYMENT_WORKER_URL` - Payment worker URL
- `REALTIME_WORKER_URL` - Realtime worker URL

### Rating Worker
- `RATING_DB` - D1 database binding

### Realtime Worker
- `ORDER_STATUS_DO` - Durable Object binding

### Log Worker
- `LOG_BUCKET` - R2 bucket binding
- `LOG_STATE` - KV namespace binding

### Health Check Worker
- All worker URLs and database/bucket bindings

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Cloudflare account with Workers, D1, KV, R2, and Durable Objects enabled
- Wrangler CLI installed globally: `npm install -g wrangler`
- PayPal Sandbox account (for payment testing)

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Create D1 Databases**
   ```bash
   # Create databases for each worker
   # Save the database IDs from the output - you'll need them for wrangler.toml files
   wrangler d1 create auth-db
   wrangler d1 create catalog-db
   wrangler d1 create pricing-db
   wrangler d1 create fulfillment-db
   wrangler d1 create cart-db
   wrangler d1 create payment-db
   wrangler d1 create orders-db
   wrangler d1 create rating-db
   ```

4. **Run Migrations**
   ```bash
   # Run migrations for each database using the appropriate config file
   # Note: Use --remote for production, or omit for local testing
   wrangler d1 execute auth-db --file=./database-schemas/auth.sql --config wrangler.authworker.toml
   wrangler d1 execute catalog-db --file=./database-schemas/catalog.sql --config wrangler.catalogworker.toml
   wrangler d1 execute pricing-db --file=./database-schemas/pricing.sql --config wrangler.pricingworker.toml
   wrangler d1 execute fulfillment-db --file=./database-schemas/fulfillment.sql --config wrangler.fulfillmentworker.toml
   wrangler d1 execute cart-db --file=./database-schemas/cart.sql --config wrangler.cartworker.toml
   wrangler d1 execute payment-db --file=./database-schemas/payment.sql --config wrangler.paymentworker.toml
   wrangler d1 execute orders-db --file=./database-schemas/orders.sql --config wrangler.ordersworker.toml
   wrangler d1 execute rating-db --file=./database-schemas/rating.sql --config wrangler.ratingworker.toml
   
   # Alternative: Use database ID directly (if you have the IDs from step 3)
   # wrangler d1 execute --database-id=YOUR_DATABASE_ID --file=./database-schemas/auth.sql
   ```

5. **Create KV Namespaces**
   ```bash
   # Create KV namespaces for caching and log state
   # Note: Use --preview flag for preview namespaces (optional)
   wrangler kv namespace create "PRODUCT_CACHE"
   wrangler kv namespace create "LOG_STATE"
   
   # Note: After creation, you'll get namespace IDs. Update the wrangler.*.toml files with these IDs:
   # - PRODUCT_CACHE namespace ID goes in wrangler.catalogworker.toml and wrangler.healthcheckworker.toml
   # - LOG_STATE namespace ID goes in wrangler.logworker.toml and wrangler.healthcheckworker.toml
   ```

6. **Create R2 Bucket**
   ```bash
   # Create R2 bucket for log storage
   wrangler r2 bucket create log-bucket
   ```

7. **Update wrangler.toml Files**
   ```bash
   # Before deploying, update each wrangler.*.toml file with:
   # - Database IDs from step 3 (replace YOUR_*_DB_ID)
   # - KV namespace IDs from step 5 (replace YOUR_*_KV_ID)
   # - Worker URLs (update with your actual worker URLs after first deployment)
   # 
   # Note: INTER_WORKER_API_KEY and ENCRYPTION_KEY are already set as vars in all toml files
   # with value "ECOMSECRET". You can change these values if needed.
   # 
   # For PayPal (payment worker only), you'll need to set secrets (see step 8)
   ```

8. **Set PayPal Secrets (Optional - for Payment Worker)**
   
   **Step 1: Get PayPal Sandbox Credentials**
   
   1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
   2. Sign in or create an account
   3. Navigate to **Dashboard** → **My Apps & Credentials**
   4. Under **Sandbox** tab, find or create an app
   5. Copy the **Client ID** and **Secret** (click "Show" to reveal the secret)
   
   **Step 2: Set Secrets in Cloudflare Workers**
   
   ```bash
   # Set PayPal Client ID (you'll be prompted to enter the value)
   wrangler secret put PAYPAL_CLIENT_ID --config wrangler.paymentworker.toml
   
   # Set PayPal Client Secret (you'll be prompted to enter the value)
   wrangler secret put PAYPAL_CLIENT_SECRET --config wrangler.paymentworker.toml
   ```
   
   **Note:** 
   - The secrets are encrypted and stored securely by Cloudflare
   - They are only accessible to the payment-worker
   - You can update them anytime by running the same commands
   - To view current secrets, use: `wrangler secret list --config wrangler.paymentworker.toml`
   
   **Step 3: Configure Sandbox Mode (Optional)**
   
   The `PAYPAL_SANDBOX` variable is already set to `"true"` in `wrangler.paymentworker.toml`.
   To switch to production mode later:
   1. Update `wrangler.paymentworker.toml`: `PAYPAL_SANDBOX = "false"`
   2. Get production credentials from PayPal Developer Dashboard
   3. Update the secrets with production credentials
   4. Redeploy the payment worker

9. **Deploy Workers**
   
   **Option 1: Use the deployment script (Recommended)**
   ```bash
   # Deploy all workers sequentially (safer, shows progress)
   ./scripts/deploy-all-workers.sh
   
   # Or deploy in parallel (faster, but may hit rate limits)
   ./scripts/deploy-all-workers-parallel.sh
   ```
   
   **Option 2: Deploy manually**
   ```bash
   # Deploy all workers (deploy in order to get URLs for inter-worker communication)
   
   # First, deploy workers that don't depend on others
   wrangler deploy --config wrangler.authworker.toml
   wrangler deploy --config wrangler.pricingworker.toml
   wrangler deploy --config wrangler.fulfillmentworker.toml
   wrangler deploy --config wrangler.ratingworker.toml
   wrangler deploy --config wrangler.logworker.toml
   wrangler deploy --config wrangler.realtimeworker.toml
   
   # Then deploy workers that depend on the above
   wrangler deploy --config wrangler.catalogworker.toml
   wrangler deploy --config wrangler.paymentworker.toml
   wrangler deploy --config wrangler.cartworker.toml
   wrangler deploy --config wrangler.ordersworker.toml
   
   # Finally, deploy health check worker (depends on all others)
   wrangler deploy --config wrangler.healthcheckworker.toml
   
   # After deployment, update worker URLs in all wrangler.toml files with actual URLs
   # Then redeploy workers that reference other workers
   ```

## API Endpoints

### Auth Worker
- `POST /signup` - User registration
- `POST /login` - User login
- `POST /refresh` - Refresh access token
- `POST /logout` - User logout
- `GET /profile` - Get user profile (protected)
- `PUT /profile` - Update user profile (protected)

### Catalog Worker
- `GET /products` - Get products with pagination
- `GET /product/:productId` - Get single product

### Cart Worker
- `GET /cart` - Get cart (protected)
- `POST /cart/item` - Add item to cart (protected)
- `PUT /cart/item/:itemId` - Update item quantity (protected)
- `DELETE /cart/item/:itemId` - Remove item from cart (protected)
- `DELETE /cart` - Clear cart (protected)

### Orders Worker
- `GET /orders` - Get user orders (protected, grouped by delivery date)
- `GET /order/:orderId` - Get single order (protected)
- `POST /order` - Create order (protected, uses Saga pattern)
- `POST /order/:orderId/rate` - Rate product (protected)

### Payment Worker
- `POST /paypal/create` - Create PayPal order
- `POST /paypal/capture` - Capture PayPal payment

### Health Check Worker
- `GET /health` - Check health of all workers and services

## Edge Cases Handled

1. **Stock Change While in Cart**: Stock is reserved when added to cart, validated at checkout
2. **Price Change While in Cart**: Price is locked when added to cart, warnings shown at checkout
3. **Service Failure in Transaction**: Saga pattern with compensation steps handles failures
4. **Order Grouping**: Orders grouped by delivery date, payment info shown with each group

## Testing

Run tests with:
```bash
npm test
```

Tests use Mocha + Chai for unit testing.

## Frontend (SvelteKit)

The frontend is built with SvelteKit for SSR on:
- Catalog page
- Single product page
- Cart page
- Orders page

## Notes

- All PII data is encrypted using AES-256-GCM
- PayPal payment IDs are encrypted before storage
- No foreign keys used - services communicate via API calls
- Soft deletes implemented for users, sessions, products, inventory, carts, and payments
- Shipping rules, orders, prices, and ratings use hard deletes (no soft delete)
- Database transactions used for multi-DML operations
- Cache invalidation: Product data cached, price/stock not cached (frequently changing)

## License

ISC

