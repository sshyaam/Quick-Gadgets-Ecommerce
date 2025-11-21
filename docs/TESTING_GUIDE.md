# Testing Guide

This document provides information about the test suite for the e-commerce application.

## Test Setup

The project uses:
- **Mocha** - Test framework
- **Chai** - Assertion library
- **Sinon** - Mocking and stubbing
- **c8** - Code coverage tool

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### View coverage report
```bash
npm run test:coverage:report
```

Coverage reports are generated in:
- Text: Console output
- HTML: `coverage/index.html`
- JSON Summary: `coverage/coverage-summary.json`

## Test Structure

Tests are organized by worker and component:

```
├── test/
│   └── setup.js              # Test utilities and mocks
├── authworker/
│   ├── models/
│   │   ├── userModel.test.js
│   │   └── sessionModel.test.js
│   ├── services/
│   │   └── authService.test.js
│   └── validation/
│       └── authValidation.test.js
├── catalogworker/
│   └── services/
│       └── catalogService.test.js
├── pricingworker/
│   └── services/
│       └── pricingService.test.js
└── shared/
    └── utils/
        ├── encryption.test.js
        └── errors.test.js
```

## Test Coverage Goals

- **Lines**: 80%+
- **Functions**: 80%+
- **Branches**: 80%+
- **Statements**: 80%+

## Mocking

The test setup includes comprehensive mocks for:
- **D1 Database** - `createMockD1()`, `createMockD1WithSequence()`
- **KV Storage** - `createMockKV()`
- **R2 Storage** - `createMockR2()`
- **Service Bindings** - `createMockServiceBinding()`
- **Requests/Responses** - `createMockRequest()`, `createMockResponse()`
- **Environment** - `createMockEnv()`

## Writing Tests

### Example Test Structure

```javascript
import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { functionToTest } from './module.js';
import { createMockD1, createMockEnv } from '../../test/setup.js';

describe('module', () => {
  let mockDb;
  let mockEnv;
  
  beforeEach(() => {
    mockDb = createMockD1();
    mockEnv = createMockEnv();
  });
  
  describe('functionToTest', () => {
    it('should handle success case', async () => {
      // Arrange
      const input = 'test-input';
      
      // Act
      const result = await functionToTest(input, mockDb);
      
      // Assert
      expect(result).to.have.property('expectedProperty');
    });
    
    it('should handle error case', async () => {
      // Arrange
      const invalidInput = null;
      
      // Act & Assert
      try {
        await functionToTest(invalidInput, mockDb);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(ExpectedError);
      }
    });
  });
});
```

## Test Categories

### Unit Tests
- Test individual functions and methods in isolation
- Mock all dependencies
- Focus on business logic

### Integration Tests
- Test interactions between components
- Use real database mocks with sequences
- Test service-to-service communication

### Validation Tests
- Test input validation schemas
- Test edge cases and invalid inputs
- Ensure proper error messages

## Best Practices

1. **Isolation**: Each test should be independent
2. **Clear Names**: Test names should describe what they test
3. **Arrange-Act-Assert**: Follow AAA pattern
4. **Mock External Dependencies**: Don't make real API calls
5. **Test Edge Cases**: Include error paths and boundary conditions
6. **Keep Tests Fast**: Use mocks, avoid I/O operations
7. **Maintain Coverage**: Aim for high coverage but focus on meaningful tests

## Common Patterns

### Testing Database Operations
```javascript
const mockDb = createMockD1WithSequence([
  { first: { id: '1', name: 'Test' } },  // First query
  { run: { success: true, meta: { changes: 1 } } }, // Second query
]);
```

### Testing Service Bindings
```javascript
mockPricingWorker._setResponse('GET', '/price/product-1', { price: 1000 });
```

### Testing Error Cases
```javascript
try {
  await functionThatShouldFail();
  expect.fail('Should have thrown an error');
} catch (error) {
  expect(error).to.be.instanceOf(ExpectedError);
  expect(error.message).to.include('expected message');
}
```

## Continuous Integration

Tests should be run in CI/CD pipelines:
```bash
npm run test:coverage
```

## Troubleshooting

### Tests timing out
- Increase timeout in test file: `--timeout 10000`
- Check for async operations not being awaited

### Mock not working
- Ensure mocks are set up in `beforeEach`
- Check that mocks match the actual API

### Coverage not accurate
- Ensure test files are excluded in `.c8rc.json`
- Check that all code paths are tested

