# Auth Worker - Deep Dive Explanation

## 🎯 Purpose & Responsibilities

The **Auth Worker** is the authentication and user management microservice. It handles:

1. **User Registration** - Creating new user accounts with encrypted PII
2. **User Authentication** - Login, logout, session management
3. **Token Management** - JWT access tokens (15 min) + refresh tokens (7 days)
4. **User Profiles** - Get/update user profile, saved addresses, password changes
5. **Authorization** - Verifying tokens for protected routes
6. **Inter-Worker Auth** - Validating sessions for other workers

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit)                     │
│  Makes HTTP requests to auth-worker.shyaamdps.workers.dev   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              authworker/index.js (Entry Point)              │
│  • Routes requests using itty-router                        │
│  • Handles CORS, error handling, tracing                    │
│  • Wraps handler with OpenTelemetry instrumentation        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         authworker/controllers/authController.js            │
│  • HTTP request/response handling                           │
│  • Input validation (JOI schemas)                          │
│  • Cookie management (accessToken, refreshToken, sessionId) │
│  • Authentication middleware                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│          authworker/services/authService.js                 │
│  • Business logic: signup, login, token generation         │
│  • Password hashing (SHA-256)                               │
│  • JWT token creation/verification                          │
│  • Session management                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         authworker/models/userModel.js                      │
│         authworker/models/sessionModel.js                   │
│  • Database operations (D1 SQLite)                          │
│  • User CRUD operations                                     │
│  • Session CRUD operations                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare D1 Database                   │
│  • users table (encrypted PII in JSONB)                     │
│  • sessions table (session tracking)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Code Structure & What Happens Where

### 1. **Entry Point: `authworker/index.js`**

**What it does:**
- Sets up routing with `itty-router`
- Handles CORS preflight (OPTIONS requests)
- Wraps everything with OpenTelemetry for tracing
- Logs structured JSON with trace IDs and CF Ray IDs
- Adds trace headers to responses

**Key Routes:**
```javascript
// Public routes (no auth required)
POST /signup          → authController.signup
POST /login           → authController.login
POST /refresh         → authController.refreshToken
POST /logout          → authController.logout
POST /set-password    → authController.setPassword

// Protected routes (require authentication)
GET  /profile         → authenticate → profileController.getProfile
PUT  /profile         → authenticate → profileController.updateProfile
PUT  /profile/password → authenticate → profileController.updatePassword
POST /profile/addresses → authenticate → profileController.addSavedAddress
PUT  /profile/addresses/:id → authenticate → profileController.updateSavedAddress
DELETE /profile/addresses/:id → authenticate → profileController.deleteSavedAddress

// Inter-worker routes (require API key)
GET  /session/:sessionId → validateWorkerRequest → authController.getSession
GET  /user/:userId      → validateWorkerRequest → profileController.getUserById
```

**Flow:**
1. Request comes in → `handler.fetch(request, env, ctx)`
2. Initialize tracing → `initRequestTrace(request, 'auth-worker')`
3. Log structured JSON → `console.log(JSON.stringify({...}))`
4. Route request → `router.handle(request, env, ctx)`
5. Add CORS headers → `addCorsHeaders(response, request)`
6. Add trace headers → `addTraceHeaders(response, request)`
7. Return response

---

### 2. **Controllers: `authworker/controllers/authController.js`**

**What it does:**
- Handles HTTP request/response
- Validates input using JOI schemas
- Manages cookies (setting, reading, clearing)
- Calls service layer for business logic
- Returns HTTP responses

**Key Functions:**

#### `signup(request, env, ctx)`
```javascript
1. Parse request body
2. Validate with signupSchema (JOI)
3. Call authService.signup() → creates user, session, tokens
4. Set cookies:
   - accessToken (15 min expiry)
   - refreshToken (7 days expiry)
   - sessionId (7 days expiry)
5. Return response with tokens in body (for localStorage fallback)
```

**Cookie Strategy:**
- **Localhost**: `SameSite=None; Secure` (for cross-origin dev)
- **Production**: `Domain=.shyaamdps.workers.dev; HttpOnly; Secure; SameSite=None`
- **Fallback**: Tokens also in response body for `localStorage` if cookies blocked

#### `login(request, env, ctx)`
```javascript
1. Parse request body (email, password)
2. Validate with loginSchema (JOI)
3. Call authService.login() → verifies password, creates session, tokens
4. Set cookies (same as signup)
5. Return response with tokens
```

#### `authenticate(request, env)` - **Middleware**
```javascript
1. Extract token from:
   - Authorization header: "Bearer <token>" (preferred, localStorage fallback)
   - Cookie: "accessToken=<token>"
2. If no token → return 401 Response
3. Call authService.authenticate() → verifies JWT, checks session
4. If valid → attach user data to request.user, return null (continue)
5. If invalid → return 401 Response
```

**Used by protected routes:**
```javascript
router.get('/profile', async (request, env) => {
  const authResult = await authController.authenticate(request, env);
  if (authResult instanceof Response) {
    return authResult; // 401 error
  }
  // Continue to profileController.getProfile
  return await profileController.getProfile(request, env);
});
```

#### `refreshToken(request, env)`
```javascript
1. Extract refreshToken from cookie
2. Call authService.refreshAccessToken() → validates refresh token, generates new tokens
3. Set new cookies
4. Return new tokens in response
```

#### `logout(request, env)`
```javascript
1. Extract sessionId from cookie
2. Call authService.logout() → deletes session from DB
3. Clear cookies (set Max-Age=0)
4. Return success response
```

---

### 3. **Services: `authworker/services/authService.js`**

**What it does:**
- Contains business logic (no HTTP concerns)
- Password hashing/verification
- JWT token generation/verification
- Encryption/decryption of PII
- Session management

**Key Functions:**

#### `signup(userData, db, encryptionKey, ...)`
```javascript
1. Normalize email (lowercase, trim)
2. Check if user exists → getUserByEmail() (decrypts all users to search)
3. Hash password → SHA-256
4. Encrypt PII data:
   {
     email: "user@example.com",
     name: "John Doe",
     contactNumber: "+91...",
     address: {...},
     password: "<hashed>",
     isAdmin: false
   }
5. Create user in DB → createUser()
6. Generate refresh token → crypto.randomUUID() + crypto.randomUUID()
7. Create session → createSession()
8. Generate access token → JWT with {userId, sessionId, type: 'access'}
9. Log event → sendLog() to log-worker
10. Return {userId, sessionId, accessToken, refreshToken}
```

#### `login(email, password, db, encryptionKey, ...)`
```javascript
1. Normalize email
2. Find user → getUserByEmail() (decrypts all users to find match)
3. Decrypt user data → decrypt(user.data, encryptionKey)
4. Extract stored password hash
5. Hash input password → SHA-256
6. Compare hashes → verifyPassword()
7. If match:
   - Generate refresh token
   - Create session
   - Generate access token
   - Log event
   - Return tokens
8. If no match → throw AuthenticationError
```

**Password Hashing:**
```javascript
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**JWT Token Generation:**
```javascript
export function generateAccessToken(userId, sessionId, secret) {
  return jwt.sign(
    { userId, sessionId, type: 'access' },
    secret, // ENCRYPTION_KEY from env
    { expiresIn: '15m' }
  );
}
```

#### `authenticate(accessToken, db, encryptionKey)`
```javascript
1. Verify JWT → jwt.verify(token, secret)
   - Decodes: {userId, sessionId, type: 'access'}
   - Checks expiry (15 min)
2. Verify session exists → getSessionById(sessionId)
3. Get user → getUserById(userId)
4. Return {userId, sessionId, user}
```

#### `refreshAccessToken(refreshToken, db, encryptionKey)`
```javascript
1. Find session by refresh token → getSessionByRefreshToken(refreshToken)
2. Generate new access token
3. Optionally rotate refresh token (new UUID)
4. Update session with new refresh token
5. Return {accessToken, refreshToken}
```

---

### 4. **Models: `authworker/models/userModel.js` & `sessionModel.js`**

**What it does:**
- Direct database operations (D1 SQLite)
- No business logic, just CRUD

**Key Functions:**

#### `getUserByEmail(db, email, encryptionKey)`
**⚠️ Performance Note:** This decrypts ALL users to find a match. In production, consider storing an email hash separately for faster lookup.

```javascript
1. SELECT * FROM users WHERE deleted_at IS NULL
2. For each user:
   - Decrypt user.data
   - Compare email (case-insensitive)
   - Return first match
3. Return null if not found
```

#### `createUser(db, userData, encryptedData)`
```javascript
INSERT INTO users (user_id, data, created_at, updated_at)
VALUES (UUID(), encryptedData, NOW(), NOW())
```

#### `createSession(db, userId, refreshToken)`
```javascript
INSERT INTO sessions (session_id, user_id, refresh_token, expires_at, ...)
VALUES (UUID(), userId, refreshToken, NOW() + 7 days, ...)
```

---

## 🔐 Security Features

### 1. **Encryption (AES-256-GCM)**
- **What's encrypted**: All PII (email, name, phone, address, password hash)
- **Where**: `shared/utils/encryption.js`
- **Key**: `ENCRYPTION_KEY` from environment
- **Why**: Protects sensitive data at rest

### 2. **Password Hashing**
- **Algorithm**: SHA-256 (simple, fast)
- **Note**: In production, use `bcrypt` or `argon2` (slower, more secure)
- **Storage**: Hashed password stored inside encrypted JSONB

### 3. **JWT Tokens**
- **Access Token**: 15 minutes expiry, contains `{userId, sessionId, type: 'access'}`
- **Refresh Token**: 7 days expiry, stored in DB (can be revoked)
- **Secret**: Uses `ENCRYPTION_KEY` (should be separate in production)

### 4. **Session Management**
- **Hybrid Approach**: JWT (stateless) + Session ID (stateful)
- **Why**: Can revoke sessions by deleting from DB
- **Storage**: `sessions` table tracks active sessions

### 5. **Cookie Security**
- **HttpOnly**: Prevents JavaScript access (XSS protection)
- **Secure**: Only sent over HTTPS
- **SameSite**: `None` for cross-origin (with `Secure`)
- **Domain**: `.shyaamdps.workers.dev` for subdomain sharing

---

## 💾 Database Schema

### `users` Table
```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,           -- UUID
  data TEXT NOT NULL,                 -- Encrypted JSONB with PII
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT                     -- Soft delete
);
```

**Encrypted `data` structure:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "contactNumber": "+91...",
  "address": {
    "recipientName": "...",
    "doorNumber": "...",
    "street": "...",
    "area": "...",
    "pincode": "600001",
    "city": "Chennai",
    "state": "Tamil Nadu"
  },
  "password": "<SHA-256 hash>",
  "isAdmin": false,
  "savedAddresses": [...],
  "profileImage": "data:image/..." // Base64
}
```

### `sessions` Table
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,        -- UUID
  user_id TEXT NOT NULL,              -- Foreign key to users
  refresh_token TEXT NOT NULL,        -- UUID + UUID
  expires_at TEXT NOT NULL,           -- 7 days from creation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT                     -- Soft delete
);
```

---

## 🔄 Authentication Flow

### **Signup Flow:**
```
1. Frontend → POST /signup {email, password, name, ...}
2. Controller → Validate input (JOI)
3. Service → Check if user exists
4. Service → Hash password
5. Service → Encrypt PII data
6. Model → INSERT INTO users
7. Service → Generate tokens
8. Model → INSERT INTO sessions
9. Controller → Set cookies + return tokens
10. Frontend → Store tokens in localStorage (fallback)
```

### **Login Flow:**
```
1. Frontend → POST /login {email, password}
2. Controller → Validate input
3. Service → Find user (decrypt all users)
4. Service → Decrypt user data
5. Service → Hash input password
6. Service → Compare hashes
7. Service → Generate tokens
8. Model → INSERT INTO sessions
9. Controller → Set cookies + return tokens
10. Frontend → Store tokens
```

### **Protected Route Flow:**
```
1. Frontend → GET /profile (with cookie or Authorization header)
2. Controller → authenticate() middleware
3. Controller → Extract token from cookie/header
4. Service → verifyAccessToken() (JWT verify)
5. Service → getSessionById() (check session exists)
6. Service → getUserById() (get user)
7. Controller → Attach user to request.user
8. Controller → Continue to profileController.getProfile()
9. Service → Decrypt user data
10. Controller → Return profile (without password)
```

### **Token Refresh Flow:**
```
1. Frontend → POST /refresh (with refreshToken cookie)
2. Controller → Extract refreshToken
3. Service → getSessionByRefreshToken()
4. Service → Generate new access token
5. Service → Optionally rotate refresh token
6. Model → UPDATE sessions
7. Controller → Set new cookies
8. Frontend → Update tokens
```

---

## 🔗 Integration with Other Workers

### **Inter-Worker Authentication:**
Other workers (orders, cart, etc.) need to verify user sessions:

```javascript
// In orders-worker or cart-worker
const response = await fetch('https://auth-worker.shyaamdps.workers.dev/session/SESSION_ID', {
  headers: {
    'X-API-Key': env.INTER_WORKER_API_KEY,
    'X-Worker-Request': 'true'
  }
});
```

**Auth Worker validates:**
1. API key matches `INTER_WORKER_API_KEY`
2. Returns session data if valid

### **Service Bindings:**
```toml
# In other workers' wrangler.toml
[[services]]
binding = "auth_worker"
service = "auth-worker"
```

**Usage:**
```javascript
// Direct service binding (no HTTP, faster)
const session = await env.auth_worker.fetch(
  new Request('https://workers.dev/session/SESSION_ID', {
    headers: { 'X-API-Key': env.INTER_WORKER_API_KEY }
  })
);
```

---

## 📊 Key Design Decisions

### 1. **Why Encrypt PII?**
- **Compliance**: GDPR, data protection laws
- **Security**: Even if DB is compromised, data is encrypted
- **Privacy**: Admins can't read user emails/addresses directly

### 2. **Why Hybrid JWT + Session?**
- **JWT**: Stateless, fast verification
- **Session**: Can revoke (delete from DB)
- **Best of both**: Fast + revocable

### 3. **Why Cookie + localStorage Fallback?**
- **Cookies**: HttpOnly (XSS protection), automatic sending
- **localStorage**: Fallback if cookies blocked (Safari ITP, etc.)
- **Authorization Header**: For programmatic access

### 4. **Why Decrypt All Users for Email Lookup?**
- **Current**: Simple, works with encrypted data
- **Future**: Store email hash separately for faster lookup
- **Trade-off**: Security vs Performance

---

## 🚨 Common Issues & Solutions

### **Issue: "Access token required"**
- **Cause**: Cookie not sent (cross-origin, SameSite blocking)
- **Solution**: Use Authorization header with localStorage token

### **Issue: "Invalid or expired refresh token"**
- **Cause**: Session deleted or expired
- **Solution**: User must login again

### **Issue: "Password not set"**
- **Cause**: Legacy user created before password storage
- **Solution**: Use `/set-password` endpoint

### **Issue: Slow email lookup**
- **Cause**: Decrypting all users
- **Solution**: Add email hash index (future improvement)

---

## 📝 Summary

**Auth Worker handles:**
- ✅ User registration with encrypted PII
- ✅ Login with password verification
- ✅ JWT token generation (15 min access, 7 day refresh)
- ✅ Session management (revocable)
- ✅ Profile management (get/update)
- ✅ Address management (CRUD)
- ✅ Password changes
- ✅ Inter-worker session validation

**Key files:**
- `index.js` → Routing, CORS, tracing
- `controllers/authController.js` → HTTP handling, cookies
- `services/authService.js` → Business logic, tokens, encryption
- `models/userModel.js` → Database operations
- `models/sessionModel.js` → Session operations

**Security:**
- AES-256-GCM encryption for PII
- SHA-256 password hashing
- JWT tokens with expiry
- HttpOnly, Secure cookies
- Session revocation support

