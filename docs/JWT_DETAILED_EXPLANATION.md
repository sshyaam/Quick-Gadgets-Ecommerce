# JWT Detailed Explanation: Header, Payload, Signature, and Refresh Tokens

## 1. JWT Structure Overview

A JWT (JSON Web Token) consists of **three parts** separated by dots (`.`):

```
header.payload.signature
```

Example:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInNlc3Npb25JZCI6InNlc3MtNDU2IiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTczNzEyMzQ1NiwiZXhwIjoxNzM3MTIzNTU2fQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Each part is **Base64URL encoded** (not regular Base64 - uses `-` and `_` instead of `+` and `/`).

---

## 2. JWT Header

The header contains **metadata** about the token.

### What's in the Header

```json
{
  "alg": "HS256",  // Algorithm used for signature (HMAC SHA-256)
  "typ": "JWT"     // Type of token (always "JWT")
}
```

### How It's Created

The `jsonwebtoken` library automatically creates the header when you call `jwt.sign()`. The algorithm is determined by the secret type:

```javascript
// From authService.js (line 44-49)
export function generateAccessToken(userId, sessionId, secret) {
  return jwt.sign(
    { userId, sessionId, type: 'access' },  // Payload
    secret,                                 // Secret key (string)
    { expiresIn: '15m' }                    // Options
  );
}
```

**When you pass a string secret** (like `env.ENCRYPTION_KEY`), the library defaults to **HS256** (HMAC SHA-256).

### Encoded Header Example

```javascript
// Original header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Base64URL encoded
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
```

---

## 3. JWT Payload

The payload contains the **claims** (data) about the user/session.

### What's in the Payload

```json
{
  "userId": "user-123",           // Custom claim: User ID
  "sessionId": "sess-456",         // Custom claim: Session ID
  "type": "access",                // Custom claim: Token type
  "iat": 1737123456,              // Standard claim: Issued At (timestamp)
  "exp": 1737123556               // Standard claim: Expiration (timestamp)
}
```

### How It's Created

```javascript
// From authService.js (line 44-49)
jwt.sign(
  { userId, sessionId, type: 'access' },  // Custom payload
  secret,
  { expiresIn: '15m' }                     // Adds 'iat' and 'exp' automatically
);
```

**Standard Claims Added Automatically:**
- `iat` (Issued At): Timestamp when token was created
- `exp` (Expiration): Timestamp when token expires (15 minutes from `iat`)

### Encoded Payload Example

```javascript
// Original payload
{
  "userId": "user-123",
  "sessionId": "sess-456",
  "type": "access",
  "iat": 1737123456,
  "exp": 1737123556
}

// Base64URL encoded
"eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInNlc3Npb25JZCI6InNlc3MtNDU2IiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTczNzEyMzQ1NiwiZXhwIjoxNzM3MTIzNTU2fQ"
```

---

## 4. JWT Signature

The signature is used to **verify** that the token hasn't been tampered with.

### How the Signature is Created

The signature is created using **HMAC SHA-256** (HS256) algorithm:

```javascript
// Pseudocode of what jwt.sign() does internally
function createSignature(header, payload, secret) {
  // Step 1: Base64URL encode header and payload
  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);
  
  // Step 2: Concatenate with dot
  const unsignedToken = encodedHeader + '.' + encodedPayload;
  
  // Step 3: Create HMAC SHA-256 signature
  const signature = hmacSha256(unsignedToken, secret);
  
  // Step 4: Base64URL encode the signature
  const encodedSignature = base64urlEncode(signature);
  
  // Step 5: Return complete token
  return unsignedToken + '.' + encodedSignature;
}
```

**Actual Implementation (what jsonwebtoken does):**
```javascript
// Simplified version
const crypto = require('crypto');

function createJWT(header, payload, secret) {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  
  // HMAC SHA-256: Hash-based Message Authentication Code
  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');
  
  return `${unsignedToken}.${signature}`;
}
```

### What the Secret Is

In this codebase, the secret is `env.ENCRYPTION_KEY`:

```javascript
// From authService.js (line 129)
const accessToken = generateAccessToken(user.userId, session.sessionId, encryptionKey);
//                                                                    ^^^^^^^^^^^^^^
//                                                                    This is env.ENCRYPTION_KEY
```

**Important:** The secret must be:
- **Kept secret** - Never exposed in client-side code
- **Long and random** - At least 32 characters for HS256
- **Consistent** - Same secret used for signing and verification

---

## 5. How Signature Verification Works

When verifying a JWT, the server:

1. **Splits the token** into header, payload, and signature
2. **Recreates the signature** using the same secret
3. **Compares** the recreated signature with the provided signature
4. **Checks expiration** (`exp` claim)

### Verification Process

```javascript
// From authService.js (line 66-72)
export function verifyAccessToken(token, secret) {
  try {
    return jwt.verify(token, secret);
    //     ^^^^^^^^^^^^^^^^^^^^^^^^
    //     This does all the verification internally
  } catch (error) {
    throw new AuthenticationError('Invalid or expired access token');
  }
}
```

**What `jwt.verify()` does internally:**

```javascript
// Pseudocode
function verifyJWT(token, secret) {
  // Step 1: Split token
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  
  // Step 2: Recreate signature
  const unsignedToken = encodedHeader + '.' + encodedPayload;
  const expectedSignature = hmacSha256(unsignedToken, secret);
  const expectedEncodedSignature = base64urlEncode(expectedSignature);
  
  // Step 3: Compare signatures (constant-time comparison to prevent timing attacks)
  if (expectedEncodedSignature !== encodedSignature) {
    throw new Error('Invalid signature');
  }
  
  // Step 4: Decode payload
  const payload = JSON.parse(base64urlDecode(encodedPayload));
  
  // Step 5: Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('Token expired');
  }
  
  // Step 6: Return decoded payload
  return payload;
}
```

### Why This Works

**Security Properties:**
1. **Tamper Detection**: If anyone modifies the header or payload, the signature won't match
2. **Secret Required**: Only someone with the secret can create a valid signature
3. **Expiration Check**: Tokens automatically expire after 15 minutes

**Example Attack Prevention:**
```javascript
// Attacker tries to change userId in payload
// Original: { userId: "user-123", ... }
// Modified: { userId: "admin", ... }

// When server verifies:
// 1. Recreates signature with modified payload
// 2. Compares with provided signature
// 3. Signatures don't match → Token rejected ✅
```

---

## 6. Refresh Token Storage

### Is the Refresh Token Stored in the DB?

**Yes!** The refresh token is stored in the `sessions` table.

### Database Schema

```sql
-- From database-schemas/auth.sql (lines 13-21)
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL,  -- ← Refresh token stored here
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
```

### How Refresh Token is Created and Stored

```javascript
// From authService.js (line 56-58)
export function generateRefreshToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
  // Example: "550e8400-e29b-41d4-a716-446655440000-6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}

// From authService.js (line 125-126)
const refreshToken = generateRefreshToken();
const session = await createSession(db, user.userId, refreshToken);
//                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                    Stored in database
```

### Session Creation

```javascript
// From sessionModel.js (line 13-35)
export async function createSession(db, userId, refreshToken) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  await db.prepare(
    `INSERT INTO sessions (session_id, user_id, refresh_token, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(sessionId, userId, refreshToken, expiresAt, now, now).run();
  
  return { sessionId, userId, expiresAt };
}
```

---

## 7. How Refresh Token Validation Works

### Validation Process

When a refresh token is used, the system:

1. **Looks up the token in the database**
2. **Checks if the session exists and is not deleted**
3. **Verifies the session hasn't expired**
4. **Rotates the refresh token** (security best practice)

### Code Implementation

```javascript
// From authService.js (line 275-327)
export async function refreshAccessToken(refreshToken, db, encryptionKey) {
  // Step 1: Look up session by refresh token
  const session = await getSessionByRefreshToken(db, refreshToken);
  //            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //            Database lookup
  
  if (!session) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
  
  // Step 2: Generate new access token
  const accessToken = generateAccessToken(session.user_id, session.session_id, encryptionKey);
  
  // Step 3: Rotate refresh token (prevents token reuse attacks)
  const newRefreshToken = generateRefreshToken();
  await updateSessionRefreshToken(db, session.session_id, newRefreshToken);
  
  return {
    accessToken,
    refreshToken: newRefreshToken,  // New token returned
    sessionId: session.session_id,
  };
}
```

### Database Lookup

```javascript
// From sessionModel.js (line 72-92)
export async function getSessionByRefreshToken(db, refreshToken) {
  // Step 1: Query database
  const result = await db
    .prepare(
      `SELECT session_id, user_id, refresh_token, expires_at, created_at, updated_at
       FROM sessions 
       WHERE refresh_token = ? AND deleted_at IS NULL`
    )
    .bind(refreshToken)
    .first();
  
  if (!result) {
    return null;  // Token not found or session deleted
  }
  
  // Step 2: Check expiration
  if (new Date(result.expires_at) < new Date()) {
    return null;  // Session expired
  }
  
  return result;  // Valid session
}
```

### Why Database Lookup is Required

**Refresh tokens are stateful** (unlike JWTs which are stateless):

1. **Revocability**: Can be invalidated by deleting the session
2. **Rotation**: Old token is replaced with new token (prevents reuse)
3. **Expiration Tracking**: Database stores expiration time
4. **Security**: If token is stolen, it can be revoked immediately

### Token Rotation (Security Feature)

```javascript
// From authService.js (line 306-312)
// Rotate refresh token for security (prevents token reuse attacks)
const newRefreshToken = generateRefreshToken();
await updateSessionRefreshToken(db, session.session_id, newRefreshToken);
//                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                              Old token is replaced in database
```

**Why Rotate?**
- If an attacker steals a refresh token, they can only use it **once**
- After first use, the token is rotated (replaced with new token)
- Attacker's stolen token becomes invalid
- Legitimate user gets new token and continues working

---

## 8. Complete Flow Example

### Login Flow

```javascript
// 1. User logs in
const { accessToken, refreshToken } = await login(email, password, ...);

// 2. Access token (JWT) is created
// Header: { alg: "HS256", typ: "JWT" }
// Payload: { userId: "user-123", sessionId: "sess-456", type: "access", iat: ..., exp: ... }
// Signature: HMAC-SHA256(header.payload, ENCRYPTION_KEY)

// 3. Refresh token is generated and stored
// Token: "550e8400-e29b-41d4-a716-446655440000-6ba7b810-9dad-11d1-80b4-00c04fd430c8"
// Stored in: sessions.refresh_token

// 4. Both tokens sent to client (cookies)
```

### Request Authentication Flow

```javascript
// 1. Client sends access token (JWT)
// Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// 2. Server verifies JWT
const decoded = jwt.verify(accessToken, ENCRYPTION_KEY);
// Returns: { userId: "user-123", sessionId: "sess-456", type: "access", iat: ..., exp: ... }

// 3. Server checks session exists (stateful check)
const session = await getSessionById(db, decoded.sessionId);
if (!session) {
  throw new AuthenticationError('Session not found');
}

// 4. Request is authenticated
```

### Token Refresh Flow

```javascript
// 1. Client sends refresh token
// Cookie: refreshToken=550e8400-e29b-41d4-a716-446655440000-6ba7b810-9dad-11d1-80b4-00c04fd430c8

// 2. Server looks up refresh token in database
const session = await getSessionByRefreshToken(db, refreshToken);
// Query: SELECT * FROM sessions WHERE refresh_token = ? AND deleted_at IS NULL

// 3. Server validates session
if (!session || new Date(session.expires_at) < new Date()) {
  throw new AuthenticationError('Invalid or expired refresh token');
}

// 4. Server generates new tokens
const newAccessToken = generateAccessToken(session.user_id, session.session_id, encryptionKey);
const newRefreshToken = generateRefreshToken();

// 5. Server rotates refresh token in database
await updateSessionRefreshToken(db, session.session_id, newRefreshToken);
// Old token is replaced, old token becomes invalid

// 6. Server returns new tokens
return { accessToken: newAccessToken, refreshToken: newRefreshToken };
```

---

## 9. Summary

### JWT (Access Token)
- **Header**: `{ alg: "HS256", typ: "JWT" }` (algorithm and type)
- **Payload**: `{ userId, sessionId, type: "access", iat, exp }` (user data + expiration)
- **Signature**: HMAC-SHA256 hash of `header.payload` using `ENCRYPTION_KEY`
- **Verification**: Recreate signature and compare, check expiration
- **Storage**: Client-side (cookies/localStorage)
- **Stateless**: No database lookup needed for verification (but session check is still done)

### Refresh Token
- **Format**: Two UUIDs joined with `-` (e.g., `uuid1-uuid2`)
- **Storage**: Database (`sessions.refresh_token`)
- **Validation**: Database lookup + expiration check
- **Rotation**: Replaced with new token on each use (security)
- **Stateful**: Requires database lookup to validate

### Key Differences

| Aspect | JWT (Access Token) | Refresh Token |
|--------|-------------------|---------------|
| **Format** | `header.payload.signature` | Random UUID string |
| **Storage** | Client-side | Database |
| **Verification** | Cryptographic signature | Database lookup |
| **Expiration** | 15 minutes | 7 days |
| **Revocable** | No (until expiry) | Yes (delete session) |
| **Rotation** | No | Yes (on each use) |
| **Stateless** | Yes | No (stateful) |

---

## 10. Security Considerations

### JWT Security
- ✅ **Signature prevents tampering**: Modified tokens are rejected
- ✅ **Expiration limits exposure**: Tokens expire after 15 minutes
- ⚠️ **Cannot revoke until expiry**: Once issued, valid until expiration
- ✅ **Session check adds revocability**: Even if JWT is valid, session check can reject it

### Refresh Token Security
- ✅ **Database lookup enables revocation**: Can delete session to invalidate
- ✅ **Token rotation prevents reuse**: Stolen tokens only work once
- ✅ **Expiration tracking**: Database stores expiration time
- ✅ **Indexed lookup**: Fast validation with database index

### Best Practices Used
1. **Short-lived access tokens** (15 minutes)
2. **Long-lived refresh tokens** (7 days)
3. **Token rotation** on refresh
4. **Session validation** for both tokens
5. **HttpOnly cookies** to prevent XSS attacks
6. **Secure flag** for HTTPS-only transmission

