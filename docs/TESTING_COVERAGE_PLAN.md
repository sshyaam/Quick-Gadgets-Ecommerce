# Testing Coverage Plan - 90% Coverage Target

## Current Status
- **Overall Coverage**: 36.31% (lines)
- **Target**: 90%+ coverage across all files

## Test Files Created

### ✅ Completed Test Files
1. **catalogworker/controllers/catalogController.test.js** - Tests for catalog controller (health check, get products, get product)
2. **catalogworker/controllers/imageController.test.js** - Tests for image upload, serve, and delete
3. **shared/utils/adminAuth.test.js** - Tests for admin authentication
4. **shared/utils/interWorker.test.js** - Tests for inter-worker communication utilities
5. **paymentworker/validation/paymentValidation.test.js** - Tests for payment validation schemas
6. **ratingworker/validation/ratingValidation.test.js** - Tests for rating validation schemas
7. **fulfillmentworker/validation/fulfillmentValidation.test.js** - Tests for fulfillment validation schemas

## Files Needing Tests (0% Coverage)

### Controllers (Critical Priority)
1. **catalogworker/controllers/adminController.js** (0%) - Product CRUD operations
2. **cartworker/controllers/cartController.js** (75.58%) - Needs improvement to 90%+
3. **fulfillmentworker/controllers/fulfillmentController.js** (0%)
4. **fulfillmentworker/controllers/adminController.js** (0%)
5. **ordersworker/controllers/ordersController.js** (0%)
6. **ordersworker/controllers/authController.js** (0%)
7. **paymentworker/controllers/paymentController.js** (0%)
8. **pricingworker/controllers/pricingController.js** (0%)
9. **ratingworker/controllers/ratingController.js** (0%)
10. **ratingworker/controllers/authController.js** (0%)
11. **logworker/controllers/logController.js** (0%)

### Index Files (Entry Points)
1. **authworker/index.js** (0%)
2. **cartworker/index.js** (0%)
3. **catalogworker/index.js** (0%)
4. **fulfillmentworker/index.js** (0%)
5. **ordersworker/index.js** (0%)
6. **paymentworker/index.js** (0%)
7. **pricingworker/index.js** (0%)
8. **ratingworker/index.js** (0%)
9. **realtimeworker/index.js** (0%)
10. **logworker/index.js** (0%)
11. **healthcheckworker/index.js** (0% - has test but 0% coverage)

### Services (Need Improvement)
1. **catalogworker/services/catalogService.js** (53.64%) - Needs improvement
2. **cartworker/services/cartService.js** (82.93%) - Needs improvement to 90%+
3. **fulfillmentworker/services/fulfillmentService.js** (51.25%) - Needs improvement
4. **ordersworker/services/orderSagaService.js** (4.18%) - Critical, needs major work
5. **authworker/services/profileService.js** (89.66%) - Close, needs minor improvement
6. **logworker/services/logService.js** (42.5%) - Needs improvement

### Models (Need Improvement)
1. **fulfillmentworker/models/inventoryModel.js** (56.79%) - Needs improvement
2. **fulfillmentworker/models/shippingModel.js** (61.17%) - Needs improvement
3. **fulfillmentworker/models/warehouseModel.js** (32.53%) - Needs improvement
4. **paymentworker/models/paymentModel.js** (39.6%) - Needs improvement
5. **ratingworker/models/ratingModel.js** (93.15%) - Close, needs minor improvement
6. **authworker/models/userModel.js** (87.79%) - Needs minor improvement

### Shared Utilities (Need Improvement)
1. **shared/utils/adminAuth.js** (0%) - Test created but needs to be fixed
2. **shared/utils/cors.js** (0%)
3. **shared/utils/database.js** (74.62%) - Needs improvement
4. **shared/utils/logger.js** (77.71%) - Needs improvement
5. **shared/utils/otel.js** (78.9%) - Needs improvement
6. **shared/utils/tracing.js** (0%)

### Validation Files
1. **logworker/validation/logValidation.js** (0%)
2. **fulfillmentworker/validation/fulfillmentValidation.js** (0%) - Test created

### Durable Objects
1. **fulfillmentworker/durableObjects/ReservedStockDO.js** (0%)
2. **realtimeworker/durableObjects/OrderStatusDurableObject.js** (0%) - Has test but 0% coverage

## Testing Strategy

### Phase 1: Critical Controllers (High Priority)
Focus on controllers that handle core business logic:
- Order processing (ordersController, orderSagaService)
- Payment processing (paymentController)
- Cart operations (cartController - improve existing)
- Catalog operations (adminController)

### Phase 2: Entry Points (Medium Priority)
Test all index.js files to ensure proper routing and error handling.

### Phase 3: Services (High Priority)
Improve service test coverage, especially:
- orderSagaService (currently 4.18%)
- fulfillmentService
- catalogService

### Phase 4: Models (Medium Priority)
Improve model test coverage for data access layer.

### Phase 5: Utilities (Low Priority)
Complete utility tests for shared code.

## Test Patterns

### Controller Test Pattern
```javascript
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as controller from './controller.js';
import { createMockEnv, createMockRequest } from '../../test/setup.js';
import sinon from 'sinon';

describe('controller', () => {
  let mockEnv;
  let sandbox;

  beforeEach(() => {
    mockEnv = createMockEnv();
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // Test cases...
});
```

### Service Test Pattern
```javascript
import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import * as service from './service.js';
import { createMockD1, createMockEnv } from '../../test/setup.js';

describe('service', () => {
  let mockDb;
  let mockEnv;

  beforeEach(() => {
    mockDb = createMockD1();
    mockEnv = createMockEnv();
  });

  // Test cases...
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
mocha path/to/test.js

# Watch mode
npm run test:watch
```

## Coverage Goals by Category

- **Controllers**: 90%+ (currently ~40% average)
- **Services**: 90%+ (currently ~60% average)
- **Models**: 90%+ (currently ~75% average)
- **Validation**: 100% (currently ~50% average)
- **Utilities**: 90%+ (currently ~60% average)
- **Entry Points**: 80%+ (currently 0%)

## Next Steps

1. Create controller tests for all workers
2. Create index.js tests for routing
3. Improve service test coverage
4. Improve model test coverage
5. Complete utility tests
6. Add integration tests for critical flows

## Notes

- Use existing test setup utilities from `test/setup.js`
- Mock external dependencies (databases, service bindings, etc.)
- Test both success and error cases
- Test edge cases and boundary conditions
- Ensure tests are isolated and don't depend on each other

