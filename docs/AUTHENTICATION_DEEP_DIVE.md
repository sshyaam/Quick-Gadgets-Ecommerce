# Authentication Deep Dive - All Your Questions Answered

## 1. Difference Between Session Management and Token Management

### **Session Management** (Stateful)
- **What it is**: Server-side tracking of user sessions in a database
- **Storage**: Database table (`sessions`)
- **Contains**: `session_id`, `user_id`, `refresh_token`, `expires_at`
- **Purpose**: Track active sessions, allow revocation
- **Example**:
  ```sql
  INSERT INTO sessions (session_id, user_id, refresh_token, expires_at)
  VALUES ('abc-123', 'user-456', 'refresh-token-xyz', '2025-01-20')
  ```

### **Token Management** (Stateless)
- **What it is**: Self-contained tokens (JWT) that carry user info
- **Storage**: Client-side (cookies/localStorage)
- **Contains**: Encoded JSON with `{userId, sessionId, type: 'access'}`
- **Purpose**: Fast verification without database lookup
- **Example**:
  ```javascript
  // JWT Token (decoded)
  {
    userId: "user-456",
    sessionId: "abc-123",
    type: "access",
    exp: 1737123456  // Expiry timestamp
  }
  ```

**Key Difference:**
- **Session** = Database record (can be deleted/revoked)
- **Token** = Self-contained string (can't be revoked until expiry)

---

## 2. How Hybrid JWT + Session Works

The system uses **both** for the best of both worlds:

### **Flow:**
```
1. Login → Creates BOTH:
   ├─ Session (in database) ← Stateful, revocable
   └─ JWT Token (sent to client) ← Stateless, fast

2. Protected Route Request:
   ├─ Client sends JWT token
   ├─ Server verifies JWT (fast, no DB lookup)
   ├─ Server checks session exists in DB (revocable)
   └─ If both valid → Allow access

3. Logout:
   ├─ Delete session from DB
   └─ JWT still valid until expiry (but session check fails)
```

### **Code Example:**
```javascript
// authService.js - authenticate()
export async function authenticate(accessToken, db, encryptionKey) {
  // Step 1: Verify JWT (stateless, fast)
  const decoded = verifyAccessToken(accessToken, encryptionKey);
  // Returns: {userId, sessionId, type: 'access'}
  
  // Step 2: Check session exists (stateful, revocable)
  const session = await getSessionById(db, decoded.sessionId);
  if (!session) {
    throw new AuthenticationError('Session not found or expired');
  }
  
  // Step 3: Get user
  const user = await getUserById(db, decoded.userId);
  
  return { userId, sessionId, user };
}
```

**Why Hybrid?**
- ✅ **JWT**: Fast verification (no DB lookup for every request)
- ✅ **Session**: Can revoke by deleting from DB
- ✅ **Best of both**: Speed + Security

---

## 3. Token Passing: Bearer Header vs Cookies

### **How It Works in This App:**

The app supports **BOTH** methods with a fallback strategy:

#### **Method 1: Cookies (Primary)**
```javascript
// Server sets cookies on login/signup
response.headers.append('Set-Cookie', `accessToken=${token}; HttpOnly; Secure; SameSite=None; Max-Age=900`);

// Browser automatically sends cookies with every request
// No code needed - browser handles it!
```

#### **Method 2: Authorization Header (Fallback)**
```javascript
// Frontend sends token in header if cookies don't work
headers['Authorization'] = `Bearer ${accessToken}`;
```

### **Backend Extraction (authController.js):**
```javascript
export async function authenticate(request, env) {
  let accessToken = null;
  
  // Try Authorization header FIRST (localStorage fallback)
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7).trim();
    console.log('[auth-worker] Using token from Authorization header');
  } else {
    // Try cookies (primary method)
    const cookies = request.headers.get('Cookie') || '';
    const cookieMatch = cookies.match(/accessToken=([^;]+)/);
    accessToken = cookieMatch ? cookieMatch[1] : null;
    if (accessToken) {
      console.log('[auth-worker] Using token from Cookie header');
    }
  }
  
  if (!accessToken) {
    return new Response(JSON.stringify({error: 'Access token required'}), {status: 401});
  }
  
  // Verify token...
}
```

### **Frontend Implementation (api.js):**
```javascript
export async function apiRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  // Browser context: Add Authorization header as fallback
  if (typeof window !== 'undefined') {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }
  
  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include'  // ← This sends cookies automatically!
  };
  
  return await fetch(url, fetchOptions);
}
```

### **How to Call Protected Routes:**

#### **Option 1: Using Cookies (Automatic)**
```javascript
// Just make the request - cookies are sent automatically
const response = await fetch('https://auth-worker.shyaamdps.workers.dev/profile', {
  credentials: 'include'  // ← Sends cookies
});
```

#### **Option 2: Using Bearer Token (Manual)**
```javascript
const accessToken = localStorage.getItem('accessToken');
const response = await fetch('https://auth-worker.shyaamdps.workers.dev/profile', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

#### **Option 3: Postman/Manual Testing**
```bash
# Method 1: Cookie
GET https://auth-worker.shyaamdps.workers.dev/profile
Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Method 2: Authorization Header
GET https://auth-worker.shyaamdps.workers.dev/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Priority:** Authorization header is checked first, then cookies.

---

## 4. Refresh Token vs Access Token

### **Access Token (Short-lived)**
- **Lifetime**: 15 minutes
- **Purpose**: Authenticate API requests
- **Storage**: Cookie (HttpOnly) + localStorage (fallback)
- **Contains**: `{userId, sessionId, type: 'access'}`
- **Why short?**: If stolen, expires quickly

### **Refresh Token (Long-lived)**
- **Lifetime**: 7 days
- **Purpose**: Get new access tokens when they expire
- **Storage**: Cookie (HttpOnly) + localStorage (fallback)
- **Contains**: Random UUID (not JWT, just a string)
- **Why long?**: Better UX (don't force login every 15 min)

### **How They Work Together:**

```
┌─────────────────────────────────────────────────────────┐
│  User Logs In                                            │
│  ├─ Access Token: 15 min expiry                         │
│  └─ Refresh Token: 7 days expiry                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  User Makes API Request (with Access Token)             │
│  ├─ Token valid? → ✅ Allow                             │
│  └─ Token expired? → ❌ 401 Unauthorized                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ (if expired)
┌─────────────────────────────────────────────────────────┐
│  Frontend Detects 401 → Calls /refresh                  │
│  ├─ Sends Refresh Token (from cookie/localStorage)      │
│  ├─ Server validates refresh token                      │
│  ├─ Server generates NEW access token                   │
│  └─ Server optionally rotates refresh token            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Frontend Gets New Tokens                               │
│  ├─ Updates localStorage                                │
│  ├─ Retries original request with new access token      │
│  └─ User continues seamlessly                           │
└─────────────────────────────────────────────────────────┘
```

### **Code Flow:**

#### **Login (authService.js):**
```javascript
export async function login(...) {
  // Generate tokens
  const refreshToken = generateRefreshToken();  // UUID + UUID
  const session = await createSession(db, user.user_id, refreshToken);
  const accessToken = generateAccessToken(user.user_id, session.sessionId, encryptionKey);
  
  return {
    accessToken,  // 15 min
    refreshToken, // 7 days
    sessionId: session.sessionId
  };
}
```

#### **Refresh Endpoint (authController.js):**
```javascript
export async function refreshToken(request, env) {
  // Extract refresh token from cookie
  const cookies = request.headers.get('Cookie') || '';
  const cookieMatch = cookies.match(/refreshToken=([^;]+)/);
  const refreshToken = cookieMatch ? cookieMatch[1] : null;
  
  if (!refreshToken) {
    throw new AuthenticationError('Refresh token required');
  }
  
  // Validate and generate new tokens
  const result = await authService.refreshAccessToken(
    refreshToken,
    env.auth_db,
    env.ENCRYPTION_KEY
  );
  
  // Set new cookies
  response.headers.append('Set-Cookie', `accessToken=${result.accessToken}; ...`);
  response.headers.append('Set-Cookie', `refreshToken=${result.refreshToken}; ...`);
  
  return response;
}
```

#### **Refresh Service (authService.js):**
```javascript
export async function refreshAccessToken(refreshToken, db, encryptionKey) {
  // Step 1: Find session by refresh token
  const session = await getSessionByRefreshToken(db, refreshToken);
  if (!session) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
  
  // Step 2: Generate new access token
  const accessToken = generateAccessToken(session.user_id, session.session_id, encryptionKey);
  
  // Step 3: Optionally rotate refresh token (security best practice)
  const newRefreshToken = generateRefreshToken();
  await updateSessionRefreshToken(db, session.session_id, newRefreshToken);
  
  return {
    accessToken,      // New 15-min token
    refreshToken: newRefreshToken  // New 7-day token (rotated)
  };
}
```

### **Using /refresh in Postman:**

#### **Step 1: Login First**
```http
POST https://auth-worker.shyaamdps.workers.dev/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "userId": "abc-123",
  "sessionId": "session-456",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "uuid1-uuid2"
}
```

**Cookies Set:**
```
accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=None; Max-Age=900
refreshToken=uuid1-uuid2; HttpOnly; Secure; SameSite=None; Max-Age=604800
```

#### **Step 2: Use Refresh Token**
```http
POST https://auth-worker.shyaamdps.workers.dev/refresh
Cookie: refreshToken=uuid1-uuid2
```

**OR with Authorization (if you stored refreshToken):**
```http
POST https://auth-worker.shyaamdps.workers.dev/refresh
Content-Type: application/json

{
  "refreshToken": "uuid1-uuid2"
}
```
*(Note: Current implementation only checks cookies, but you could modify to accept body)*

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // New token
  "refreshToken": "uuid3-uuid4"  // Rotated token
}
```

**New Cookies Set:**
```
accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Max-Age=900
refreshToken=uuid3-uuid4; Max-Age=604800
```

---

## 5. Stateless vs Stateful

### **JWT is Stateless (No Database Lookup)**

**What "Stateless" Means:**
- Token contains all info needed for verification
- Server doesn't need to check database to verify token
- Can verify token on any server (no shared state)

**Example:**
```javascript
// JWT Token (decoded)
{
  userId: "user-123",
  sessionId: "session-456",
  type: "access",
  exp: 1737123456  // Expiry timestamp
}

// Verification (no DB lookup!)
const decoded = jwt.verify(token, secret);
// ✅ Valid if signature matches and not expired
// ❌ No database query needed!
```

**Pros:**
- ✅ Fast (no DB query)
- ✅ Scalable (any server can verify)
- ✅ Works offline (if you have the secret)

**Cons:**
- ❌ Can't revoke until expiry
- ❌ Can't see active sessions
- ❌ Token size grows with data

### **Session ID is Stateful (Database Lookup)**

**What "Stateful" Means:**
- Session info stored in database
- Server must check database to verify session
- Can revoke by deleting from database

**Example:**
```javascript
// Session in Database
{
  session_id: "session-456",
  user_id: "user-123",
  refresh_token: "uuid1-uuid2",
  expires_at: "2025-01-20T10:00:00Z"
}

// Verification (requires DB lookup)
const session = await getSessionById(db, sessionId);
// ✅ Valid if exists and not expired
// ❌ Requires database query
```

**Pros:**
- ✅ Can revoke (delete from DB)
- ✅ Can see all active sessions
- ✅ Can track session metadata

**Cons:**
- ❌ Slower (DB query every time)
- ❌ Requires shared database
- ❌ More complex

### **Hybrid Approach (Best of Both)**

```javascript
// Step 1: Verify JWT (stateless, fast)
const decoded = jwt.verify(accessToken, secret);
// ✅ Fast, no DB

// Step 2: Check session exists (stateful, revocable)
const session = await getSessionById(db, decoded.sessionId);
// ✅ Can revoke by deleting session
```

**Result:**
- Fast verification (JWT)
- Revocable (Session)
- Best of both worlds!

---

## 6. Why Soft Delete Sessions?

### **What is Soft Delete?**
Instead of `DELETE FROM sessions`, we do:
```sql
UPDATE sessions 
SET deleted_at = NOW() 
WHERE session_id = ?
```

### **Why Soft Delete?**

#### **1. Audit Trail**
```sql
-- See when user logged out
SELECT session_id, user_id, created_at, deleted_at 
FROM sessions 
WHERE user_id = 'user-123' 
ORDER BY created_at DESC;
```

#### **2. Security Analysis**
```sql
-- Find suspicious activity
SELECT * FROM sessions 
WHERE user_id = 'user-123' 
  AND deleted_at IS NOT NULL 
  AND created_at > '2025-01-01';
```

#### **3. Session History**
```sql
-- See all sessions (active + deleted)
SELECT 
  session_id,
  user_id,
  created_at,
  deleted_at,
  CASE 
    WHEN deleted_at IS NULL THEN 'Active'
    ELSE 'Deleted'
  END as status
FROM sessions
WHERE user_id = 'user-123';
```

#### **4. Data Recovery**
```sql
-- Restore accidentally deleted session
UPDATE sessions 
SET deleted_at = NULL 
WHERE session_id = 'session-456' 
  AND deleted_at IS NOT NULL;
```

#### **5. Analytics**
```sql
-- Average session duration
SELECT 
  AVG(
    (julianday(deleted_at) - julianday(created_at)) * 24 * 60
  ) as avg_minutes
FROM sessions 
WHERE deleted_at IS NOT NULL;
```

### **Code Implementation:**
```javascript
// sessionModel.js
export async function deleteSession(db, sessionId) {
  // Soft delete (not hard delete)
  const result = await db
    .prepare(
      `UPDATE sessions 
       SET deleted_at = ? 
       WHERE session_id = ? AND deleted_at IS NULL`
    )
    .bind(new Date().toISOString(), sessionId)
    .run();
  
  return result.success && result.meta.changes > 0;
}

// When checking session, exclude soft-deleted
export async function getSessionById(db, sessionId) {
  const result = await db
    .prepare(
      `SELECT * FROM sessions 
       WHERE session_id = ? AND deleted_at IS NULL`  // ← Excludes soft-deleted
    )
    .bind(sessionId)
    .first();
  
  return result;
}
```

---

## 7. Cookie Storage: SSR vs Frontend

### **How Cookies Are Set:**

#### **Server-Side (SSR) - During Login/Signup**
```javascript
// authController.js - login()
export async function login(request, env, ctx) {
  // ... login logic ...
  
  // Create response
  const response = new Response(
    JSON.stringify({ userId, sessionId, accessToken, refreshToken }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
  
  // Set cookies on SERVER response
  response.headers.append('Set-Cookie', `accessToken=${accessToken}; HttpOnly; Secure; SameSite=None; Max-Age=900`);
  response.headers.append('Set-Cookie', `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=None; Max-Age=604800`);
  
  return response;  // ← Browser receives this and stores cookies
}
```

**What Happens:**
1. Server creates response with `Set-Cookie` headers
2. Browser receives response
3. Browser **automatically** stores cookies (if SameSite/Secure allow)
4. Browser **automatically** sends cookies with future requests

#### **Frontend Receives Response:**
```javascript
// frontend/src/routes/login/+page.svelte
async function handleLogin() {
  const result = await authApi.login(email, password);
  
  // Server already set cookies via Set-Cookie headers
  // But we also store in localStorage as fallback
  if (result.accessToken) {
    localStorage.setItem('accessToken', result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    localStorage.setItem('sessionId', result.sessionId);
  }
  
  // Cookies are stored by browser automatically
  // localStorage is stored by our code (fallback)
}
```

### **Cookie Storage Flow:**

```
┌─────────────────────────────────────────────────────────┐
│  1. User Logs In (POST /login)                          │
└──────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  2. Server Response                                     │
│  Set-Cookie: accessToken=...; HttpOnly; Secure; ...     │
│  Set-Cookie: refreshToken=...; HttpOnly; Secure; ...    │
│  Body: {accessToken, refreshToken, ...}                 │
└──────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  3. Browser Receives Response                            │
│  ├─ Automatically stores cookies (if allowed)           │
│  │  └─ Stored in browser's cookie jar                   │
│  └─ Frontend code stores in localStorage (fallback)     │
│     └─ Stored in browser's localStorage                 │
└──────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  4. Future Requests                                      │
│  ├─ Browser automatically sends cookies                │
│  │  └─ Cookie: accessToken=...; refreshToken=...       │
│  └─ Frontend code sends Authorization header (fallback) │
│     └─ Authorization: Bearer ...                        │
└─────────────────────────────────────────────────────────┘
```

### **Where Cookies Are Stored:**

#### **Browser Cookie Storage (Automatic)**
- **Location**: Browser's cookie jar (not accessible via JavaScript if HttpOnly)
- **Access**: Only via HTTP requests (automatic)
- **Lifetime**: Based on `Max-Age` or `Expires`
- **Scope**: Domain-based (`.shyaamdps.workers.dev`)

#### **localStorage (Manual Fallback)**
- **Location**: Browser's localStorage (accessible via JavaScript)
- **Access**: `localStorage.getItem('accessToken')`
- **Lifetime**: Until cleared manually
- **Scope**: Origin-based (specific domain)

### **SSR Context (SvelteKit):**

In SvelteKit, cookies work differently in server vs client:

#### **Server-Side (`+page.server.js`):**
```javascript
export async function load({ cookies, fetch }) {
  // cookies is a SvelteKit cookie object
  // Automatically includes cookies from browser
  
  // Make request with cookies
  const response = await fetch('https://auth-worker.../profile', {
    headers: {
      'Cookie': cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ')
    }
  });
}
```

#### **Client-Side (`+page.svelte`):**
```javascript
// Cookies are sent automatically with fetch if credentials: 'include'
const response = await fetch('https://auth-worker.../profile', {
  credentials: 'include'  // ← Sends cookies automatically
});
```

### **Summary:**

| Aspect | Cookies | localStorage |
|--------|---------|--------------|
| **Set By** | Server (Set-Cookie header) | Frontend code |
| **Stored By** | Browser automatically | Frontend code |
| **Access** | HTTP requests only (if HttpOnly) | JavaScript |
| **Sent** | Automatically with requests | Must add to headers manually |
| **Lifetime** | Max-Age/Expires | Until cleared |
| **Security** | HttpOnly (XSS protection) | Accessible to JavaScript |

**In This App:**
- ✅ **Cookies**: Primary method (automatic, secure)
- ✅ **localStorage**: Fallback (if cookies blocked)
- ✅ **Authorization Header**: Fallback (if cookies blocked)

---

## Summary

1. **Session vs Token**: Session = DB record (revocable), Token = JWT (fast)
2. **Hybrid**: JWT for speed, Session for revocation
3. **Token Passing**: Both cookies (primary) and Bearer header (fallback)
4. **Refresh Token**: Long-lived token to get new access tokens
5. **Stateless vs Stateful**: JWT = no DB, Session = DB lookup
6. **Soft Delete**: Keep history, audit trail, analytics
7. **Cookie Storage**: Set by server, stored by browser automatically

