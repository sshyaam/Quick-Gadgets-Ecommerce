# Worker Testing Guide

This guide provides CLI commands and Postman collection examples to test all worker endpoints.

## Quick Test Script

Run the automated test script:

```bash
./scripts/test-workers.sh
```

## Manual Testing with cURL

### Health Checks

```bash
# Auth Worker
curl https://auth-worker.shyaamdps.workers.dev/health

# Catalog Worker
curl https://catalog-worker.shyaamdps.workers.dev/health

# Pricing Worker
curl https://pricing-worker.shyaamdps.workers.dev/health

# Fulfillment Worker
curl https://fulfillment-worker.shyaamdps.workers.dev/health

# Cart Worker
curl https://cart-worker.shyaamdps.workers.dev/health

# Payment Worker
curl https://payment-worker.shyaamdps.workers.dev/health

# Orders Worker
curl https://orders-worker.shyaamdps.workers.dev/health

# Rating Worker
curl https://rating-worker.shyaamdps.workers.dev/health

# Log Worker
curl https://log-worker.shyaamdps.workers.dev/health

# Realtime Worker
curl https://realtime-worker.shyaamdps.workers.dev/health

# Health Check Worker
curl https://health-check-worker.shyaamdps.workers.dev/health
```

### Auth Worker

#### Signup
```bash
curl -X POST https://auth-worker.shyaamdps.workers.dev/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "contactNumber": "9876543210",
    "address": {
      "name": "John Doe",
      "contactNumber": "9876543210",
      "doorNumber": "123",
      "street": "MG Road",
      "area": "Andheri",
      "pincode": "400001",
      "city": "Mumbai",
      "state": "Maharashtra"
    }
  }' \
  -v
```

#### Login
```bash
curl -X POST https://auth-worker.shyaamdps.workers.dev/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }' \
  -v -c cookies.txt
```

#### Get Profile (requires auth cookie)
```bash
curl https://auth-worker.shyaamdps.workers.dev/profile \
  -H "Cookie: $(cat cookies.txt | grep accessToken | awk '{print $7}')" \
  -v
```

### Catalog Worker

#### Get Products
```bash
curl "https://catalog-worker.shyaamdps.workers.dev/products?page=1&limit=20"
```

#### Get Single Product
```bash
curl "https://catalog-worker.shyaamdps.workers.dev/product/PRODUCT-UUID-HERE"
```

### Pricing Worker (Inter-worker)

#### Get Price
```bash
curl https://pricing-worker.shyaamdps.workers.dev/product/PRODUCT-UUID-HERE \
  -H "X-API-Key: ECOMSECRET"
```

### Fulfillment Worker (Inter-worker)

#### Get Stock
```bash
curl https://fulfillment-worker.shyaamdps.workers.dev/stock/PRODUCT-UUID-HERE \
  -H "X-API-Key: ECOMSECRET"
```

#### Get Shipping Options
```bash
curl -X POST https://fulfillment-worker.shyaamdps.workers.dev/shipping/calculate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ECOMSECRET" \
  -d '{
    "category": "smartphones",
    "shippingMode": "standard",
    "quantity": 1,
    "address": {
      "pincode": "400001",
      "city": "Mumbai",
      "state": "Maharashtra"
    }
  }'
```

### Cart Worker (Requires Auth)

#### Get Cart
```bash
curl https://cart-worker.shyaamdps.workers.dev/cart \
  -H "Cookie: accessToken=YOUR_TOKEN"
```

#### Add Item to Cart
```bash
curl -X POST https://cart-worker.shyaamdps.workers.dev/cart/item \
  -H "Content-Type: application/json" \
  -H "Cookie: accessToken=YOUR_TOKEN" \
  -d '{
    "productId": "PRODUCT-UUID",
    "quantity": 1,
    "lockedPrice": 1299.99,
    "lockedStock": 50
  }'
```

## Postman Collection

### Environment Variables

Create a Postman environment with:
- `base_url`: Your worker base URL
- `api_key`: `ECOMSECRET`
- `access_token`: (set after login)
- `product_id`: (set after getting products)

### Sample Requests

#### 1. Health Check
- **Method**: GET
- **URL**: `{{base_url}}/health`
- **Headers**: None

#### 2. Signup
- **Method**: POST
- **URL**: `{{base_url}}/signup`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "contactNumber": "9876543210",
  "address": {
    "name": "John Doe",
    "contactNumber": "9876543210",
    "doorNumber": "123",
    "street": "MG Road",
    "area": "Andheri",
    "pincode": "400001",
    "city": "Mumbai",
    "state": "Maharashtra"
  }
}
```

#### 3. Login
- **Method**: POST
- **URL**: `{{base_url}}/login`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```
- **Tests** (to save token):
```javascript
if (pm.response.code === 200) {
    const cookies = pm.response.cookies.toObject();
    pm.environment.set("access_token", cookies.accessToken);
}
```

#### 4. Get Products
- **Method**: GET
- **URL**: `{{base_url}}/products?page=1&limit=20`

#### 5. Get Price (Inter-worker)
- **Method**: GET
- **URL**: `{{base_url}}/product/{{product_id}}`
- **Headers**: `X-API-Key: {{api_key}}`

## Common Issues

### "Failed to fetch" Error
- Check if worker is deployed
- Verify worker URL is correct
- Check CORS settings (if calling from browser)
- Verify network connectivity

### 401 Unauthorized
- Check if access token cookie is set
- Verify token hasn't expired
- Try refreshing the token

### 404 Not Found
- Verify route path is correct
- Check if worker is deployed
- Verify worker is responding to `/health`

### 500 Internal Server Error
- Check worker logs in Cloudflare dashboard
- Verify database is set up correctly
- Check if required environment variables are set

## Testing Checklist

- [ ] All health endpoints return 200
- [ ] Signup creates user successfully
- [ ] Login returns access token
- [ ] Products endpoint returns data
- [ ] Price endpoint works with API key
- [ ] Stock endpoint works with API key
- [ ] Cart operations work with auth
- [ ] Shipping calculation works with address

