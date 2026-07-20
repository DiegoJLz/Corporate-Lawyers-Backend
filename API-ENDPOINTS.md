# API Endpoints -- Corporate Lawyers Platform

> Base URL: `/api/v1` (all versioned endpoints)
> Authentication: Bearer JWT unless marked **Public**

---

## Table of Contents

1. [Pagination (common)](#pagination-common-to-all-list-endpoints)
2. [Auth (`/api/v1/auth`)](#1-auth-apiv1auth)
3. [Users (`/api/v1/users`)](#2-users-apiv1users)
4. [Cases (`/api/v1/cases`)](#3-cases-apiv1cases)
5. [Documents (`/api/v1/documents`)](#4-documents-apiv1documents)
6. [Calendar / Events (`/api/v1/events`)](#5-calendar--events-apiv1events)
7. [Time Entries (`/api/v1/time-entries`)](#6-time-entries-apiv1time-entries)
8. [Expenses (`/api/v1/expenses`)](#7-expenses-apiv1expenses)
9. [Invoices (`/api/v1/invoices`)](#8-invoices-apiv1invoices)
10. [Payments (`/api/v1/payments`)](#9-payments-apiv1payments)
11. [CRM - Leads (`/api/v1/leads`)](#10-crm---leads-apiv1leads)
12. [CRM - Intake (`/api/v1/leads/:leadId/intake`)](#11-crm---intake-apiv1leadsleadidintake)
13. [Messaging (`/api/v1/messages`)](#12-messaging-apiv1messages)
14. [Notifications (`/api/v1/notifications`)](#13-notifications-apiv1notifications)
15. [Client Portal - Dashboard (`/api/v1/portal/dashboard`)](#14-client-portal---dashboard-apiv1portaldashboard)
16. [Client Portal - Cases (`/api/v1/portal/cases`)](#15-client-portal---cases-apiv1portalcases)
17. [Client Portal - Documents (`/api/v1/portal/documents`)](#16-client-portal---documents-apiv1portaldocuments)
18. [Client Portal - Invoices (`/api/v1/portal/invoices`)](#17-client-portal---invoices-apiv1portalinvoices)
19. [Client Portal - Calendar (`/api/v1/portal/calendar`)](#18-client-portal---calendar-apiv1portalcalendar)
20. [Client Portal - Messages (`/api/v1/portal/messages`)](#19-client-portal---messages-apiv1portalmessages)
21. [Client Portal - Profile (`/api/v1/portal/profile`)](#20-client-portal---profile-apiv1portalprofile)
22. [PDF Generation](#21-pdf-generation)
23. [CFDI (Mexican e-invoicing)](#22-cfdi-mexican-e-invoicing)
24. [Signatures (`/api/v1/signatures`)](#23-signatures-apiv1signatures)
25. [Signature Webhooks (`/api/v1/webhooks/signatures`)](#24-signature-webhooks-apiv1webhookssignatures)
26. [Webhooks (`/api/v1/webhooks`)](#25-webhooks-apiv1webhooks)
27. [Health (`/health`)](#26-health-health)
28. [Search (`/api/v1/search`)](#27-search-apiv1search)

---

## Pagination (common to all list endpoints)

All list/query endpoints accept the following query parameters inherited from `PaginationQueryDto`:

| Param       | Type    | Default     | Description                              |
|-------------|---------|-------------|------------------------------------------|
| `limit`     | integer | 20          | Items per page (1 - 100)                 |
| `offset`    | integer | 0           | Number of items to skip                  |
| `cursor`    | string  | -           | Cursor for cursor-based pagination       |
| `sortBy`    | string  | `createdAt` | Field to sort by                         |
| `sortOrder` | string  | `desc`      | Sort direction: `asc` or `desc`          |

---

## 1. Auth (`/api/v1/auth`)

### POST /api/v1/auth/register
**Auth:** Public | **Roles:** Any

Register a new user account.

**Body:**
```json
{
  "email": "juan.perez@firma.com",
  "password": "SecurePass123!",
  "firstName": "Juan",
  "lastName": "Perez",
  "phone": "+52 55 1234 5678"       // optional
}
```

**Response:**
```json
{
  "id": "uuid",
  "email": "juan.perez@firma.com",
  "firstName": "Juan",
  "lastName": "Perez"
}
```

---

### POST /api/v1/auth/login
**Auth:** Public | **Roles:** Any | **Rate limit:** 5 req/min

Login with email and password. Returns JWT tokens.

**Body:**
```json
{
  "email": "juan.perez@firma.com",
  "password": "SecurePass123!",
  "twoFactorCode": "123456"         // optional, required if 2FA enabled
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "abc...",
  "user": { "id": "uuid", "email": "...", "role": "LAWYER" }
}
```

---

### POST /api/v1/auth/refresh
**Auth:** Public | **Roles:** Any

Refresh the access token using a valid refresh token.

**Body:**
```json
{
  "refreshToken": "abc..."
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "new-abc..."
}
```

---

### POST /api/v1/auth/logout
**Auth:** Required | **Roles:** Any

Logout the current session (invalidates one refresh token).

**Body:**
```json
{
  "refreshToken": "abc..."
}
```

**Response:**
```json
{ "message": "Logged out successfully" }
```

---

### POST /api/v1/auth/logout-all
**Auth:** Required | **Roles:** Any

Logout all sessions for the current user.

**Response:**
```json
{ "message": "All sessions terminated" }
```

---

### POST /api/v1/auth/2fa/setup
**Auth:** Required | **Roles:** Any

Set up two-factor authentication. Returns a QR code / secret for an authenticator app.

**Response:**
```json
{
  "secret": "BASE32SECRET",
  "qrCodeUrl": "otpauth://totp/..."
}
```

---

### POST /api/v1/auth/2fa/verify
**Auth:** Required | **Roles:** Any | **Rate limit:** 3 req/min

Verify and enable two-factor authentication.

**Body:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{ "message": "2FA enabled successfully" }
```

---

### POST /api/v1/auth/2fa/disable
**Auth:** Required | **Roles:** Any

Disable two-factor authentication (requires current TOTP code).

**Body:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{ "message": "2FA disabled" }
```

---

### POST /api/v1/auth/forgot-password
**Auth:** Public | **Roles:** Any | **Rate limit:** 3 req/min

Request a password reset email.

**Body:**
```json
{
  "email": "juan.perez@firma.com"
}
```

**Response:**
```json
{ "message": "If an account exists, a reset email has been sent" }
```

---

### POST /api/v1/auth/reset-password
**Auth:** Public | **Roles:** Any | **Rate limit:** 3 req/min

Reset password using a token received by email.

**Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{ "message": "Password reset successfully" }
```

---

## 2. Users (`/api/v1/users`)

All endpoints require authentication (Bearer JWT).

### POST /api/v1/users
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Create a new user (admin-only provisioning).

**Body:**
```json
{
  "email": "nuevo@firma.com",
  "password": "SecurePass123!",
  "firstName": "Maria",
  "lastName": "Lopez",
  "role": "LAWYER",
  "phone": "+52 55 9876 5432"
}
```

**Response:**
```json
{
  "id": "uuid",
  "email": "nuevo@firma.com",
  "firstName": "Maria",
  "lastName": "Lopez",
  "role": "LAWYER",
  "isActive": true
}
```

---

### GET /api/v1/users
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

List all users with filters.

**Query (extends PaginationQueryDto):**

| Param    | Type   | Description                       |
|----------|--------|-----------------------------------|
| `role`   | enum   | Filter by UserRole                |
| `search` | string | Search in name/email              |
| `isActive` | boolean | Filter active/inactive users    |

**Response:**
```json
{
  "data": [ { "id": "uuid", "email": "...", "role": "LAWYER", ... } ],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

---

### GET /api/v1/users/me
**Auth:** Required | **Roles:** Any

Get current authenticated user's profile.

**Response:**
```json
{
  "id": "uuid",
  "email": "...",
  "firstName": "Juan",
  "lastName": "Perez",
  "role": "LAWYER",
  "lawyerProfile": { ... },
  "clientProfile": { ... }
}
```

---

### GET /api/v1/users/:id
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Get a user by ID.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Response:** Same shape as `GET /me`.

---

### PATCH /api/v1/users/:id
**Auth:** Required | **Roles:** Own profile or ADMIN/SUPER_ADMIN

Update user profile. Non-admin users can only update their own profile.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Body:**
```json
{
  "firstName": "Juan Carlos",
  "phone": "+52 55 0000 0000"
}
```

**Response:** Updated user object.

---

### DELETE /api/v1/users/:id
**Auth:** Required | **Roles:** SUPER_ADMIN

Soft-delete a user.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Response:** `204 No Content`

---

### POST /api/v1/users/:id/lawyer-profile
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Create a lawyer profile for an existing user.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Body:**
```json
{
  "barNumber": "12345",
  "specializations": ["Derecho Mercantil"],
  "hourlyRate": 3500
}
```

**Response:** Created lawyer profile object.

---

### PATCH /api/v1/users/:id/lawyer-profile
**Auth:** Required | **Roles:** Own profile or ADMIN/SUPER_ADMIN

Update a lawyer profile.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Body:** Partial lawyer profile fields.

**Response:** Updated lawyer profile object.

---

### POST /api/v1/users/:id/client-profile
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Create a client profile for an existing user.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Body:**
```json
{
  "clientType": "INDIVIDUAL",
  "rfc": "XAXX010101000",
  "companyName": "Empresa S.A. de C.V."
}
```

**Response:** Created client profile object.

---

### PATCH /api/v1/users/:id/client-profile
**Auth:** Required | **Roles:** Own profile or ADMIN/SUPER_ADMIN

Update a client profile.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | User ID     |

**Body:** Partial client profile fields.

**Response:** Updated client profile object.

---

## 3. Cases (`/api/v1/cases`)

All endpoints require authentication. Access is enforced per-case based on assignments and role.

### GET /api/v1/cases
**Auth:** Required | **Roles:** Any (filtered by role)

List cases. Admins see all; lawyers see assigned cases; clients see their own.

**Query (extends PaginationQueryDto):**

| Param      | Type   | Description                                     |
|------------|--------|-------------------------------------------------|
| `status`   | enum   | CaseStatus: INTAKE, ACTIVE, ON_HOLD, CLOSED, ARCHIVED |
| `type`     | enum   | CaseType                                        |
| `priority` | enum   | LOW, MEDIUM, HIGH, CRITICAL                     |
| `lawyerId` | UUID   | Filter by assigned lawyer                       |
| `clientId` | UUID   | Filter by client profile                        |
| `search`   | string | Search in title, caseNumber, description        |
| `dateFrom` | date   | Filter by creation date (from)                  |
| `dateTo`   | date   | Filter by creation date (to)                    |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "caseNumber": "CASE-2026-0001",
      "title": "Juicio Mercantil - Empresa X vs Empresa Y",
      "status": "ACTIVE",
      "type": "LITIGATION",
      "priority": "HIGH"
    }
  ],
  "meta": { "total": 15, "limit": 20, "offset": 0 }
}
```

---

### POST /api/v1/cases
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Create a new case.

**Body:**
```json
{
  "title": "Juicio Mercantil - Empresa X vs Empresa Y",
  "description": "Descripcion del caso...",
  "type": "LITIGATION",
  "priority": "HIGH",
  "legalArea": "Derecho Mercantil",
  "court": "Juzgado 5to Civil",
  "courtFileNumber": "EXP-2026/12345",
  "clientProfileId": "uuid",
  "assignedLawyerId": "uuid"
}
```

**Response:** Created case object with `201 Created`.

---

### GET /api/v1/cases/conflict-check
**Auth:** Required | **Roles:** Any

Check for conflicts of interest by party name across all cases.

**Query:**

| Param  | Type   | Description                |
|--------|--------|----------------------------|
| `name` | string | Name to check for conflicts |

**Response:**
```json
{
  "conflicts": [
    { "caseId": "uuid", "caseNumber": "...", "partyName": "...", "role": "PLAINTIFF" }
  ]
}
```

---

### GET /api/v1/cases/:id
**Auth:** Required | **Roles:** Any (case access enforced)

Get full case details by ID.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Response:** Full case object with assignments, parties, and counts.

---

### PATCH /api/v1/cases/:id
**Auth:** Required | **Roles:** Lead attorney or ADMIN

Update case metadata.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Body:** Partial `CreateCaseDto` fields (title, description, priority, legalArea, court, courtFileNumber).

**Response:** Updated case object.

---

### DELETE /api/v1/cases/:id
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Soft-delete a case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Response:** `204 No Content`

---

### PATCH /api/v1/cases/:id/status
**Auth:** Required | **Roles:** Lead attorney or ADMIN

Update case status with validated transitions.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Body:**
```json
{
  "status": "CLOSED",
  "reason": "Se resolvio a favor del demandante"
}
```

**Response:** Updated case with new status.

---

### GET /api/v1/cases/:id/assignments
**Auth:** Required | **Roles:** Any (case access enforced)

List all lawyer/assistant assignments for a case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Response:**
```json
[
  { "userId": "uuid", "role": "LEAD_ATTORNEY", "user": { "firstName": "...", "lastName": "..." } }
]
```

---

### POST /api/v1/cases/:id/assignments
**Auth:** Required | **Roles:** Lead attorney or ADMIN

Assign a lawyer or assistant to the case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Body:**
```json
{
  "userId": "uuid",
  "role": "CO_COUNSEL"
}
```
`role` options: `LEAD_ATTORNEY`, `CO_COUNSEL`, `ASSOCIATE`, `PARALEGAL`, `ASSISTANT`

**Response:** Created assignment object.

---

### DELETE /api/v1/cases/:id/assignments/:userId
**Auth:** Required | **Roles:** Lead attorney or ADMIN

Remove a team member assignment from the case.

**Params:**

| Param    | Type | Description          |
|----------|------|----------------------|
| `id`     | UUID | Case ID              |
| `userId` | UUID | User ID to unassign  |

**Response:** `204 No Content`

---

### GET /api/v1/cases/:id/parties
**Auth:** Required | **Roles:** Any (case access enforced)

List all parties involved in a case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Response:**
```json
[
  { "id": "uuid", "name": "Juan Perez", "role": "PLAINTIFF", "email": "...", "phone": "..." }
]
```

---

### POST /api/v1/cases/:id/parties
**Auth:** Required | **Roles:** Any (case access enforced)

Add a party to the case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Body:**
```json
{
  "name": "Juan Perez Garcia",
  "role": "PLAINTIFF",
  "email": "juan@ejemplo.com",
  "phone": "+52 55 1234 5678",
  "address": "Av. Reforma 123",
  "notes": "Representante legal de la empresa"
}
```

**Response:** Created party object.

---

### PATCH /api/v1/cases/:id/parties/:partyId
**Auth:** Required | **Roles:** Any (case access enforced)

Update a party's information.

**Params:**

| Param     | Type | Description |
|-----------|------|-------------|
| `id`      | UUID | Case ID     |
| `partyId` | UUID | Party ID    |

**Body:** Partial `AddPartyDto` fields.

**Response:** Updated party object.

---

### DELETE /api/v1/cases/:id/parties/:partyId
**Auth:** Required | **Roles:** Any (case access enforced)

Remove a party from the case.

**Params:**

| Param     | Type | Description |
|-----------|------|-------------|
| `id`      | UUID | Case ID     |
| `partyId` | UUID | Party ID    |

**Response:** `204 No Content`

---

### GET /api/v1/cases/:id/notes
**Auth:** Required | **Roles:** Any (case access enforced)

List case notes.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Query:**

| Param        | Type    | Description                        |
|--------------|---------|------------------------------------|
| `isInternal` | string  | `"true"` or `"false"` filter       |
| `limit`      | number  | Default 20                         |
| `offset`     | number  | Default 0                          |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "content": "...", "isInternal": true, "author": { ... }, "createdAt": "..." }
  ],
  "meta": { "total": 5 }
}
```

---

### POST /api/v1/cases/:id/notes
**Auth:** Required | **Roles:** Any (case access enforced)

Add a note to the case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Body:**
```json
{
  "content": "El cliente confirmo la reunion del viernes",
  "isInternal": true
}
```

**Response:** Created note object.

---

### PATCH /api/v1/cases/:id/notes/:noteId
**Auth:** Required | **Roles:** Note author or ADMIN

Edit an existing note.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Case ID     |
| `noteId` | UUID | Note ID     |

**Body:**
```json
{
  "content": "Updated note content"
}
```

**Response:** Updated note object.

---

### DELETE /api/v1/cases/:id/notes/:noteId
**Auth:** Required | **Roles:** Note author or ADMIN

Soft-delete a note.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Case ID     |
| `noteId` | UUID | Note ID     |

**Response:** `204 No Content`

---

### GET /api/v1/cases/:id/timeline
**Auth:** Required | **Roles:** Any (case access enforced)

Get the case activity timeline (cursor-based pagination).

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Query:**

| Param    | Type   | Description           |
|----------|--------|-----------------------|
| `limit`  | number | Items per page (default 20) |
| `cursor` | string | Cursor for next page  |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "action": "STATUS_CHANGED", "details": { ... }, "createdAt": "..." }
  ],
  "nextCursor": "cursor-string"
}
```

---

### GET /api/v1/cases/:id/tasks
**Auth:** Required | **Roles:** Any (case access enforced)

List tasks for a case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Query:**

| Param         | Type   | Description                   |
|---------------|--------|-------------------------------|
| `isCompleted` | string | `"true"` or `"false"` filter  |
| `assigneeId`  | UUID   | Filter by assigned user       |
| `priority`    | string | Filter by priority            |

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Preparar contestacion de demanda",
    "isCompleted": false,
    "priority": "HIGH",
    "dueDate": "2026-07-15",
    "assignee": { ... }
  }
]
```

---

### POST /api/v1/cases/:id/tasks
**Auth:** Required | **Roles:** Any (case access enforced)

Create a task for the case.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Body:**
```json
{
  "title": "Preparar contestacion de demanda",
  "description": "Revisar expediente y preparar documento",
  "assigneeId": "uuid",
  "dueDate": "2026-07-15",
  "priority": "HIGH"
}
```

**Response:** Created task object.

---

### PATCH /api/v1/cases/:id/tasks/:taskId
**Auth:** Required | **Roles:** Any (case access enforced)

Update a task.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Case ID     |
| `taskId` | UUID | Task ID     |

**Body:** Partial `CreateTaskDto` fields.

**Response:** Updated task object.

---

### PATCH /api/v1/cases/:id/tasks/:taskId/complete
**Auth:** Required | **Roles:** Any (case access enforced)

Mark a task as completed.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Case ID     |
| `taskId` | UUID | Task ID     |

**Response:** Updated task object with `isCompleted: true`.

---

### DELETE /api/v1/cases/:id/tasks/:taskId
**Auth:** Required | **Roles:** Any (case access enforced)

Delete a task.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Case ID     |
| `taskId` | UUID | Task ID     |

**Response:** `204 No Content`

---

### POST /api/v1/cases/:id/generate-summary
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Generate a case summary PDF.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Response:**
```json
{
  "message": "Case summary PDF generated",
  "pdfUrl": "https://storage.example.com/..."
}
```

---

## 4. Documents (`/api/v1/documents`)

All endpoints require authentication.

### GET /api/v1/documents
**Auth:** Required | **Roles:** Any (filtered by role)

List all documents with filters.

**Query (extends PaginationQueryDto):**

| Param            | Type    | Description                    |
|------------------|---------|--------------------------------|
| `caseId`         | UUID    | Filter by case                 |
| `type`           | string  | Document type filter           |
| `isConfidential` | boolean | Filter confidential docs       |
| `search`         | string  | Search in title                |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "title": "Contrato.pdf", "type": "CONTRACT", "size": 102400 }
  ],
  "meta": { "total": 8 }
}
```

---

### GET /api/v1/documents/search
**Auth:** Required | **Roles:** Any

Full-text search documents by title.

**Query:**

| Param | Type   | Description    |
|-------|--------|----------------|
| `q`   | string | Search query   |

**Response:** Array of matching document objects.

---

### POST /api/v1/documents/upload
**Auth:** Required | **Roles:** Any

Upload a new document (multipart/form-data).

**Body (multipart/form-data):**

| Field            | Type     | Required | Description                   |
|------------------|----------|----------|-------------------------------|
| `file`           | binary   | Yes      | The file to upload            |
| `title`          | string   | Yes      | Document title                |
| `type`           | string   | No       | Document type                 |
| `isConfidential` | boolean  | No       | Mark as confidential          |
| `tags`           | string[] | No       | Tag list                      |
| `caseId`         | UUID     | No       | Link to a case on upload      |

**Response:** Created document object with storage URL.

---

### GET /api/v1/documents/:id
**Auth:** Required | **Roles:** Any (access enforced)

Get document by ID.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:** Document object with metadata.

---

### PATCH /api/v1/documents/:id
**Auth:** Required | **Roles:** Any

Update document metadata (title, type, tags, confidentiality).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Body:** Partial document metadata fields.

**Response:** Updated document object.

---

### DELETE /api/v1/documents/:id
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Soft-delete a document (admin only).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:** `204 No Content`

---

### GET /api/v1/documents/:id/download
**Auth:** Required | **Roles:** Any

Get a presigned download URL for the document.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:**
```json
{ "url": "https://storage.example.com/presigned-url..." }
```

---

### GET /api/v1/documents/:id/versions
**Auth:** Required | **Roles:** Any

List all versions of a document.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:**
```json
[
  { "versionNumber": 1, "uploadedBy": "uuid", "changeDescription": "...", "createdAt": "..." }
]
```

---

### GET /api/v1/documents/:id/versions/:versionNumber/download
**Auth:** Required | **Roles:** Any

Download a specific version of a document.

**Params:**

| Param           | Type   | Description       |
|-----------------|--------|-------------------|
| `id`            | UUID   | Document ID       |
| `versionNumber` | number | Version number    |

**Response:**
```json
{ "url": "https://storage.example.com/presigned-url..." }
```

---

### POST /api/v1/documents/:id/versions
**Auth:** Required | **Roles:** Any

Upload a new version of an existing document (multipart/form-data).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Body (multipart/form-data):**

| Field               | Type   | Required | Description              |
|---------------------|--------|----------|--------------------------|
| `file`              | binary | Yes      | The new version file     |
| `changeDescription` | string | No       | Description of changes   |

**Response:** Created version object.

---

### POST /api/v1/documents/:id/link-case
**Auth:** Required | **Roles:** Any

Link a document to a case.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Body:**
```json
{ "caseId": "uuid" }
```

**Response:** Link object.

---

### DELETE /api/v1/documents/:id/link-case/:caseId
**Auth:** Required | **Roles:** Any

Unlink a document from a case.

**Params:**

| Param    | Type | Description  |
|----------|------|--------------|
| `id`     | UUID | Document ID  |
| `caseId` | UUID | Case ID      |

**Response:** `204 No Content`

---

### GET /api/v1/documents/:id/signatures
**Auth:** Required | **Roles:** ADMIN, LAWYER, CLIENT

Get all signature requests for a document.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:**
```json
[
  { "id": "uuid", "status": "PENDING", "signerEmail": "...", "signedAt": null }
]
```

---

## 5. Calendar / Events (`/api/v1/events`)

All endpoints require authentication.

### POST /api/v1/events
**Auth:** Required | **Roles:** Any

Create a new calendar event.

**Body:**
```json
{
  "title": "Audiencia - Caso 2026-001",
  "description": "Audiencia inicial",
  "startTime": "2026-07-15T10:00:00Z",
  "endTime": "2026-07-15T12:00:00Z",
  "location": "Juzgado 5to Civil",
  "type": "HEARING",
  "caseId": "uuid"
}
```

**Response:** Created event object.

---

### GET /api/v1/events
**Auth:** Required | **Roles:** Any (filtered by role)

List events with filters.

**Query (extends PaginationQueryDto):**

| Param      | Type   | Description              |
|------------|--------|--------------------------|
| `dateFrom` | date   | Filter from date         |
| `dateTo`   | date   | Filter to date           |
| `type`     | enum   | Event type filter        |
| `caseId`   | UUID   | Filter by case           |

**Response:**
```json
{
  "data": [ { "id": "uuid", "title": "Audiencia", "startTime": "...", ... } ],
  "meta": { "total": 12 }
}
```

---

### GET /api/v1/events/:id
**Auth:** Required | **Roles:** Any

Get event by ID.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Response:** Full event object with attendees and reminders.

---

### PATCH /api/v1/events/:id
**Auth:** Required | **Roles:** Event creator or ADMIN

Update an event.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Body:** Partial event fields.

**Response:** Updated event object.

---

### DELETE /api/v1/events/:id
**Auth:** Required | **Roles:** Event creator or ADMIN

Soft-delete an event.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Response:** `204 No Content`

---

### GET /api/v1/events/:id/attendees
**Auth:** Required | **Roles:** Any

Get event attendees.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Response:**
```json
[
  { "userId": "uuid", "status": "ACCEPTED", "user": { "firstName": "...", "lastName": "..." } }
]
```

---

### POST /api/v1/events/:id/attendees
**Auth:** Required | **Roles:** Any

Add attendee to event.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Body:**
```json
{ "userId": "uuid" }
```

**Response:** Created attendee object.

---

### PATCH /api/v1/events/:id/attendees/:userId
**Auth:** Required | **Roles:** Own status or ADMIN

Update attendee status (ACCEPTED, DECLINED, TENTATIVE).

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Event ID    |
| `userId` | UUID | Attendee user ID |

**Body:**
```json
{ "status": "ACCEPTED" }
```

**Response:** Updated attendee object.

---

### DELETE /api/v1/events/:id/attendees/:userId
**Auth:** Required | **Roles:** Any

Remove attendee from event.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `id`     | UUID | Event ID    |
| `userId` | UUID | Attendee user ID |

**Response:** `204 No Content`

---

### POST /api/v1/events/:id/reminders
**Auth:** Required | **Roles:** Any

Add a reminder to an event.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Body:**
```json
{
  "minutesBefore": 30,
  "type": "EMAIL"
}
```

**Response:** Created reminder object.

---

### DELETE /api/v1/events/:id/reminders/:reminderId
**Auth:** Required | **Roles:** Any

Remove a reminder from an event.

**Params:**

| Param        | Type | Description  |
|--------------|------|--------------|
| `id`         | UUID | Event ID     |
| `reminderId` | UUID | Reminder ID  |

**Response:** `204 No Content`

---

### GET /api/v1/calendar/availability/:userId
**Auth:** Required | **Roles:** Any

Get a user's availability for a date range.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `userId` | UUID | User ID     |

**Query:**

| Param      | Type   | Description       |
|------------|--------|-------------------|
| `dateFrom` | string | Start date (ISO)  |
| `dateTo`   | string | End date (ISO)    |

**Response:**
```json
{
  "available": true,
  "events": [ { "startTime": "...", "endTime": "..." } ]
}
```

---

## 6. Time Entries (`/api/v1/time-entries`)

All endpoints require authentication.

### GET /api/v1/time-entries
**Auth:** Required | **Roles:** Any (filtered by role)

List time entries.

**Query (extends PaginationQueryDto):**

| Param        | Type    | Description                 |
|--------------|---------|-----------------------------|
| `caseId`     | UUID    | Filter by case              |
| `lawyerId`   | UUID    | Filter by lawyer            |
| `isBillable` | boolean | Filter billable/non-billable|
| `dateFrom`   | date    | From date                   |
| `dateTo`     | date    | To date                     |

**Response:**
```json
{
  "data": [ { "id": "uuid", "description": "...", "hours": 2.5, "rate": 2500, ... } ],
  "meta": { "total": 25 }
}
```

---

### POST /api/v1/time-entries
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Create a time entry.

**Body:**
```json
{
  "caseId": "uuid",
  "description": "Revision de contrato de arrendamiento",
  "hours": 2.5,
  "rate": 2500,
  "isBillable": true,
  "date": "2026-07-01"
}
```

**Response:** Created time entry object.

---

### GET /api/v1/time-entries/summary/:caseId
**Auth:** Required | **Roles:** Any

Get time entry summary for a case (total hours, total amount).

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `caseId` | UUID | Case ID     |

**Response:**
```json
{
  "totalHours": 45.5,
  "billableHours": 40.0,
  "totalAmount": 100000,
  "entries": 18
}
```

---

### GET /api/v1/time-entries/:id
**Auth:** Required | **Roles:** Any

Get time entry by ID.

**Params:**

| Param | Type | Description     |
|-------|------|-----------------|
| `id`  | UUID | Time entry ID   |

**Response:** Time entry object with case and lawyer details.

---

### PATCH /api/v1/time-entries/:id
**Auth:** Required | **Roles:** Entry owner or ADMIN

Update a time entry.

**Params:**

| Param | Type | Description     |
|-------|------|-----------------|
| `id`  | UUID | Time entry ID   |

**Body:** Partial `CreateTimeEntryDto` fields.

**Response:** Updated time entry object.

---

### DELETE /api/v1/time-entries/:id
**Auth:** Required | **Roles:** Entry owner or ADMIN

Soft-delete a time entry.

**Params:**

| Param | Type | Description     |
|-------|------|-----------------|
| `id`  | UUID | Time entry ID   |

**Response:** `204 No Content`

---

## 7. Expenses (`/api/v1/expenses`)

All endpoints require authentication.

### GET /api/v1/expenses
**Auth:** Required | **Roles:** Any (filtered by role)

List expenses.

**Query (extends PaginationQueryDto):** Same filters as time entries (caseId, lawyerId, isBillable, dateFrom, dateTo).

**Response:**
```json
{
  "data": [ { "id": "uuid", "description": "...", "amount": 1500.00, ... } ],
  "meta": { "total": 10 }
}
```

---

### POST /api/v1/expenses
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER, ASSISTANT

Create an expense.

**Body:**
```json
{
  "caseId": "uuid",
  "description": "Viaticos para audiencia",
  "amount": 1500.00,
  "isBillable": true,
  "date": "2026-07-01",
  "receiptUrl": "https://storage.example.com/receipt.jpg"
}
```

**Response:** Created expense object.

---

### GET /api/v1/expenses/:id
**Auth:** Required | **Roles:** Any (access enforced)

Get expense by ID.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Expense ID  |

**Response:** Expense object.

---

### PATCH /api/v1/expenses/:id
**Auth:** Required | **Roles:** Entry owner or ADMIN

Update an expense.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Expense ID  |

**Body:** Partial `CreateExpenseDto` fields.

**Response:** Updated expense object.

---

### DELETE /api/v1/expenses/:id
**Auth:** Required | **Roles:** Entry owner or ADMIN

Soft-delete an expense.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Expense ID  |

**Response:** `204 No Content`

---

## 8. Invoices (`/api/v1/invoices`)

All endpoints require authentication.

### GET /api/v1/invoices
**Auth:** Required | **Roles:** Any (filtered by role)

List invoices.

**Query (extends PaginationQueryDto):**

| Param            | Type   | Description                       |
|------------------|--------|-----------------------------------|
| `caseId`         | UUID   | Filter by case                    |
| `clientProfileId`| UUID   | Filter by client                  |
| `status`         | enum   | DRAFT, SENT, PAID, OVERDUE, CANCELLED |
| `dateFrom`       | date   | Filter from date                  |
| `dateTo`         | date   | Filter to date                    |

**Response:**
```json
{
  "data": [ { "id": "uuid", "invoiceNumber": "INV-2026-0001", "status": "SENT", "total": 50000 } ],
  "meta": { "total": 12 }
}
```

---

### POST /api/v1/invoices
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Create an invoice from time entries, expenses, and/or manual items.

**Body:**
```json
{
  "caseId": "uuid",
  "clientProfileId": "uuid",
  "dueDate": "2026-08-01",
  "taxRate": 0.16,
  "notes": "Honorarios mes de julio",
  "timeEntryIds": ["uuid", "uuid"],
  "expenseIds": ["uuid"],
  "items": [
    {
      "description": "Honorarios por consultoria",
      "quantity": 1,
      "unitPrice": 5000
    }
  ]
}
```

**Response:** Created invoice object with calculated totals.

---

### GET /api/v1/invoices/summary/:caseId
**Auth:** Required | **Roles:** Any

Get financial summary for a case.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `caseId` | UUID | Case ID     |

**Response:**
```json
{
  "totalInvoiced": 150000,
  "totalPaid": 100000,
  "totalPending": 50000,
  "invoiceCount": 3
}
```

---

### GET /api/v1/invoices/:id
**Auth:** Required | **Roles:** Any (access enforced)

Get invoice by ID with line items.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:** Invoice object with items, payments, and client details.

---

### PATCH /api/v1/invoices/:id
**Auth:** Required | **Roles:** Any (access enforced)

Update invoice (status transitions, metadata). Status changes follow validated transitions.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Body:** Partial invoice fields (status, dueDate, notes, taxRate).

**Response:** Updated invoice object.

---

### DELETE /api/v1/invoices/:id
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Delete an invoice (only allowed for DRAFT status).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:** `204 No Content`

---

### POST /api/v1/invoices/:id/items
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Add a manual line item to an invoice.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Body:**
```json
{
  "description": "Honorarios por consultoria",
  "quantity": 1,
  "unitPrice": 5000
}
```

**Response:** Updated invoice with new item.

---

### PATCH /api/v1/invoices/:id/items/:itemId
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Update an invoice line item.

**Params:**

| Param    | Type | Description     |
|----------|------|-----------------|
| `id`     | UUID | Invoice ID      |
| `itemId` | UUID | Invoice item ID |

**Body:** Same as `AddInvoiceItemDto`.

**Response:** Updated invoice.

---

### DELETE /api/v1/invoices/:id/items/:itemId
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Remove a line item from an invoice.

**Params:**

| Param    | Type | Description     |
|----------|------|-----------------|
| `id`     | UUID | Invoice ID      |
| `itemId` | UUID | Invoice item ID |

**Response:** `204 No Content`

---

### POST /api/v1/invoices/:id/generate-pdf
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Generate and store a PDF for the invoice.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:**
```json
{
  "message": "PDF generated successfully",
  "pdfUrl": "https://storage.example.com/..."
}
```

---

### GET /api/v1/invoices/:id/pdf
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER, CLIENT

Get presigned URL for an invoice PDF. Clients can only access their own invoices (excludes DRAFT).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:**
```json
{
  "url": "https://storage.example.com/presigned-url...",
  "invoiceNumber": "INV-2026-0001"
}
```

---

## 9. Payments (`/api/v1/payments`)

All endpoints require authentication.

### GET /api/v1/payments
**Auth:** Required | **Roles:** Any (filtered by role)

List payments.

**Query (extends PaginationQueryDto):**

| Param       | Type   | Description              |
|-------------|--------|--------------------------|
| `invoiceId` | UUID   | Filter by invoice        |
| `method`    | enum   | PaymentMethod filter     |
| `dateFrom`  | date   | From date                |
| `dateTo`    | date   | To date                  |

**Response:**
```json
{
  "data": [ { "id": "uuid", "amount": 15000, "method": "TRANSFER", "reference": "..." } ],
  "meta": { "total": 5 }
}
```

---

### POST /api/v1/payments
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Register a payment for an invoice.

**Body:**
```json
{
  "invoiceId": "uuid",
  "amount": 15000.00,
  "method": "TRANSFER",
  "reference": "REF-2026-001",
  "notes": "Pago parcial",
  "paidAt": "2026-07-01T00:00:00Z"
}
```

**Response:** Created payment object. Invoice status auto-updates if fully paid.

---

### GET /api/v1/payments/:id
**Auth:** Required | **Roles:** Any

Get payment by ID.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Payment ID   |

**Response:** Payment object with invoice reference.

---

## 10. CRM - Leads (`/api/v1/leads`)

### GET /api/v1/leads
**Auth:** Required | **Roles:** Any (filtered by role)

List leads.

**Query (extends PaginationQueryDto):**

| Param       | Type   | Description              |
|-------------|--------|--------------------------|
| `status`    | enum   | LeadStatus filter        |
| `source`    | enum   | LeadSource filter        |
| `assignedTo`| UUID   | Filter by assigned user  |
| `search`    | string | Search name/email        |

**Response:**
```json
{
  "data": [ { "id": "uuid", "firstName": "Juan", "lastName": "Perez", "status": "NEW", ... } ],
  "meta": { "total": 20 }
}
```

---

### POST /api/v1/leads
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Create a new lead (internal).

**Body:**
```json
{
  "firstName": "Juan",
  "lastName": "Perez",
  "email": "juan.perez@example.com",
  "phone": "+52 55 1234 5678",
  "source": "REFERRAL",
  "areaOfInterest": "Derecho corporativo",
  "message": "Necesito asesoria para constituir una empresa..."
}
```

**Response:** Created lead object.

---

### POST /api/v1/leads/public
**Auth:** Public | **Roles:** Any | **Rate limit:** 5 req/hour

Submit a lead from a public website form. Same body as internal lead creation.

**Body:** Same as `POST /api/v1/leads`.

**Response:** Created lead object (limited fields).

---

### GET /api/v1/leads/:id
**Auth:** Required | **Roles:** Any

Get lead by ID.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Response:** Full lead object with intake and conflict check data.

---

### PATCH /api/v1/leads/:id
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Update lead information.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Body:** Partial `CreateLeadDto` fields plus `status`.

**Response:** Updated lead object.

---

### DELETE /api/v1/leads/:id
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Delete a lead. Only allowed if status is NEW and no intake form exists.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Response:** `204 No Content`

---

### PATCH /api/v1/leads/:id/assign
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Assign a lead to a lawyer or admin for follow-up.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Body:**
```json
{ "assignedToId": "uuid" }
```

**Response:** Updated lead object.

---

### POST /api/v1/leads/:id/convert
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Convert a lead into a client. Creates a user account and client profile.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Body:**
```json
{
  "password": "SecurePass123!",
  "clientType": "INDIVIDUAL",
  "rfc": "XAXX010101000",
  "companyName": "Empresa S.A. de C.V."
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "email": "..." },
  "clientProfile": { "id": "uuid", "clientType": "INDIVIDUAL" },
  "lead": { "id": "uuid", "status": "CONVERTED" }
}
```

---

### POST /api/v1/leads/:id/conflict-check
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Run a conflict of interest check on a lead.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Response:**
```json
{
  "hasConflicts": false,
  "conflicts": [],
  "checkedAt": "2026-07-01T..."
}
```

---

### GET /api/v1/leads/:id/conflict-checks
**Auth:** Required | **Roles:** Any

Get conflict check history for a lead.

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Lead ID     |

**Response:**
```json
[
  { "id": "uuid", "hasConflicts": false, "checkedBy": "uuid", "checkedAt": "..." }
]
```

---

## 11. CRM - Intake (`/api/v1/leads/:leadId/intake`)

All endpoints require authentication.

### GET /api/v1/leads/:leadId/intake
**Auth:** Required | **Roles:** Any

Get the intake form data for a lead.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `leadId` | UUID | Lead ID     |

**Response:**
```json
{
  "id": "uuid",
  "leadId": "uuid",
  "responses": { "legalIssue": "Constitucion de sociedad", "urgency": "medium" },
  "submittedAt": "2026-07-01T..."
}
```

---

### POST /api/v1/leads/:leadId/intake
**Auth:** Required | **Roles:** Any

Submit an intake form for a lead.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `leadId` | UUID | Lead ID     |

**Body:**
```json
{
  "responses": {
    "legalIssue": "Constitucion de sociedad",
    "urgency": "medium",
    "budget": "50000-100000"
  }
}
```

**Response:** Created intake object.

---

### PATCH /api/v1/leads/:leadId/intake
**Auth:** Required | **Roles:** Any

Update intake form responses.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `leadId` | UUID | Lead ID     |

**Body:** Same as `POST` (full replacement of responses object).

**Response:** Updated intake object.

---

## 12. Messaging (`/api/v1/messages`)

All endpoints require authentication.

### GET /api/v1/messages
**Auth:** Required | **Roles:** Any (filtered by role)

List messages for a case. Automatically marks retrieved messages as read.

**Query (extends PaginationQueryDto):**

| Param    | Type | Required | Description         |
|----------|------|----------|---------------------|
| `caseId` | UUID | Yes      | Case to get messages for |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "content": "...", "sender": { ... }, "receiver": { ... }, "readAt": "..." }
  ],
  "meta": { "total": 30 }
}
```

---

### POST /api/v1/messages
**Auth:** Required | **Roles:** Any

Send a message within a case.

**Body:**
```json
{
  "caseId": "uuid",
  "receiverId": "uuid",
  "content": "Mensaje sobre el caso...",
  "attachments": []
}
```

**Response:** Created message object.

---

### GET /api/v1/messages/unread
**Auth:** Required | **Roles:** Any

Get unread message counts grouped by case.

**Response:**
```json
[
  { "caseId": "uuid", "caseTitle": "...", "unreadCount": 3 }
]
```

---

### GET /api/v1/messages/unread/:caseId
**Auth:** Required | **Roles:** Any

Get unread message count for a specific case.

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `caseId` | UUID | Case ID     |

**Response:**
```json
{ "caseId": "uuid", "unreadCount": 5 }
```

---

### GET /api/v1/messages/:id
**Auth:** Required | **Roles:** Any

Get a single message by ID.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Message ID   |

**Response:** Message object with sender/receiver details.

---

### PATCH /api/v1/messages/read
**Auth:** Required | **Roles:** Any

Mark multiple messages as read (batch operation).

**Body:**
```json
{
  "messageIds": ["uuid", "uuid", "uuid"]
}
```

**Response:**
```json
{ "marked": 3 }
```

---

## 13. Notifications (`/api/v1/notifications`)

All endpoints require authentication.

### GET /api/v1/notifications
**Auth:** Required | **Roles:** Any

Get all notifications for the current user.

**Query (extends PaginationQueryDto):**

| Param    | Type    | Description                 |
|----------|---------|-----------------------------|
| `isRead` | boolean | Filter read/unread          |
| `type`   | enum    | Notification type filter    |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "type": "CASE_UPDATED", "title": "...", "body": "...", "isRead": false }
  ],
  "meta": { "total": 15 }
}
```

---

### GET /api/v1/notifications/unread-count
**Auth:** Required | **Roles:** Any

Get the count of unread notifications.

**Response:**
```json
{ "count": 7 }
```

---

### PATCH /api/v1/notifications/read
**Auth:** Required | **Roles:** Any

Mark notifications as read.

**Body:**
```json
{
  "notificationIds": ["uuid", "uuid"],
  "markAll": false
}
```

**Response:**
```json
{ "marked": 2 }
```

---

### GET /api/v1/notifications/:id
**Auth:** Required | **Roles:** Any

Get a single notification by ID.

**Params:**

| Param | Type | Description      |
|-------|------|------------------|
| `id`  | UUID | Notification ID  |

**Response:** Notification object.

---

## 14. Client Portal - Dashboard (`/api/v1/portal/dashboard`)

All Client Portal endpoints require authentication and CLIENT role (ClientOnlyGuard).

### GET /api/v1/portal/dashboard
**Auth:** Required | **Roles:** CLIENT

Get the client dashboard overview. Includes active case count, upcoming events, pending invoices, unread messages.

**Response:**
```json
{
  "activeCases": 2,
  "upcomingEvents": [ ... ],
  "pendingInvoices": { "count": 1, "totalAmount": 25000 },
  "unreadMessages": 3,
  "recentActivity": [ ... ]
}
```

---

## 15. Client Portal - Cases (`/api/v1/portal/cases`)

### GET /api/v1/portal/cases
**Auth:** Required | **Roles:** CLIENT

List the client's cases.

**Query (extends PaginationQueryDto):**

| Param    | Type   | Description                     |
|----------|--------|---------------------------------|
| `status` | enum   | CaseStatus filter               |
| `search` | string | Search in title / case number   |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "caseNumber": "...", "title": "...", "status": "ACTIVE", "leadAttorney": { ... } }
  ],
  "meta": { "total": 2 }
}
```

---

### GET /api/v1/portal/cases/:id
**Auth:** Required | **Roles:** CLIENT

Get a single case by ID (client's own cases only).

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Response:** Case object with limited fields (no internal notes, no confidential documents).

---

### GET /api/v1/portal/cases/:id/timeline
**Auth:** Required | **Roles:** CLIENT

Get case timeline (public entries only, excludes internal activity).

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Query:** Standard PaginationQueryDto.

**Response:**
```json
{
  "data": [ { "action": "STATUS_CHANGED", "details": { ... }, "createdAt": "..." } ],
  "meta": { "total": 10 }
}
```

---

### GET /api/v1/portal/cases/:id/notes
**Auth:** Required | **Roles:** CLIENT

Get case notes (non-internal only).

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Query:** Standard PaginationQueryDto.

**Response:**
```json
{
  "data": [ { "id": "uuid", "content": "...", "createdAt": "..." } ],
  "meta": { "total": 3 }
}
```

---

### GET /api/v1/portal/cases/:id/documents
**Auth:** Required | **Roles:** CLIENT

Get case documents (non-confidential only).

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Case ID     |

**Query:** Standard PaginationQueryDto.

**Response:**
```json
{
  "data": [ { "id": "uuid", "title": "Contrato.pdf", "type": "CONTRACT", ... } ],
  "meta": { "total": 4 }
}
```

---

## 16. Client Portal - Documents (`/api/v1/portal/documents`)

### GET /api/v1/portal/documents
**Auth:** Required | **Roles:** CLIENT

List all documents accessible to the client (non-confidential, linked to client's cases).

**Query (extends PaginationQueryDto):**

| Param    | Type   | Description        |
|----------|--------|--------------------|
| `caseId` | UUID   | Filter by case     |
| `type`   | string | Document type      |
| `search` | string | Search in title    |

**Response:**
```json
{
  "data": [ { "id": "uuid", "title": "...", "type": "CONTRACT", ... } ],
  "meta": { "total": 6 }
}
```

---

### GET /api/v1/portal/documents/:id
**Auth:** Required | **Roles:** CLIENT

Get a specific document by ID (client access enforced).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:** Document object.

---

### GET /api/v1/portal/documents/:id/download
**Auth:** Required | **Roles:** CLIENT

Get a presigned download URL for a document (client access enforced).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Document ID  |

**Response:**
```json
{ "url": "https://storage.example.com/presigned-url..." }
```

---

## 17. Client Portal - Invoices (`/api/v1/portal/invoices`)

### GET /api/v1/portal/invoices
**Auth:** Required | **Roles:** CLIENT

List the client's invoices (excludes DRAFT invoices).

**Query (extends PaginationQueryDto):**

| Param    | Type | Description            |
|----------|------|------------------------|
| `status` | enum | SENT, PAID, OVERDUE, CANCELLED |
| `caseId` | UUID | Filter by case         |

**Response:**
```json
{
  "data": [ { "id": "uuid", "invoiceNumber": "INV-2026-0001", "total": 50000, "status": "SENT" } ],
  "meta": { "total": 3 }
}
```

---

### GET /api/v1/portal/invoices/summary
**Auth:** Required | **Roles:** CLIENT

Get a financial summary for the client.

**Response:**
```json
{
  "totalInvoiced": 150000,
  "totalPaid": 100000,
  "totalPending": 50000,
  "overdueAmount": 0
}
```

---

### GET /api/v1/portal/invoices/:id
**Auth:** Required | **Roles:** CLIENT

Get invoice by ID with line items and payments.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:** Full invoice object with items and payment history.

---

### GET /api/v1/portal/invoices/:id/payments
**Auth:** Required | **Roles:** CLIENT

Get payments for a specific invoice.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:**
```json
[
  { "id": "uuid", "amount": 15000, "method": "TRANSFER", "paidAt": "2026-07-01" }
]
```

---

## 18. Client Portal - Calendar (`/api/v1/portal/calendar`)

### GET /api/v1/portal/calendar
**Auth:** Required | **Roles:** CLIENT

List events where the client is an attendee.

**Query (extends PaginationQueryDto):**

| Param      | Type | Description       |
|------------|------|-------------------|
| `dateFrom` | date | From date filter  |
| `dateTo`   | date | To date filter    |
| `caseId`   | UUID | Filter by case    |

**Response:**
```json
{
  "data": [ { "id": "uuid", "title": "Audiencia", "startTime": "...", "endTime": "..." } ],
  "meta": { "total": 2 }
}
```

---

### GET /api/v1/portal/calendar/:id
**Auth:** Required | **Roles:** CLIENT

Get event by ID (client access enforced).

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| `id`  | UUID | Event ID    |

**Response:** Event object.

---

## 19. Client Portal - Messages (`/api/v1/portal/messages`)

### GET /api/v1/portal/messages
**Auth:** Required | **Roles:** CLIENT

Get message conversations grouped by case.

**Response:**
```json
[
  { "caseId": "uuid", "caseTitle": "...", "lastMessage": { ... }, "unreadCount": 2 }
]
```

---

### GET /api/v1/portal/messages/unread
**Auth:** Required | **Roles:** CLIENT

Get unread message counts by case.

**Response:**
```json
[
  { "caseId": "uuid", "unreadCount": 3 }
]
```

---

### GET /api/v1/portal/messages/:caseId
**Auth:** Required | **Roles:** CLIENT

Get messages for a specific case (auto-marks as read).

**Params:**

| Param    | Type | Description |
|----------|------|-------------|
| `caseId` | UUID | Case ID     |

**Query (extends PaginationQueryDto):** Standard pagination.

**Response:**
```json
{
  "data": [
    { "id": "uuid", "content": "...", "sender": { ... }, "createdAt": "..." }
  ],
  "meta": { "total": 15 }
}
```

---

### POST /api/v1/portal/messages
**Auth:** Required | **Roles:** CLIENT

Send a message to the lead attorney or admin.

**Body:**
```json
{
  "caseId": "uuid",
  "content": "Tengo una pregunta sobre el caso..."
}
```

**Response:** Created message object.

---

## 20. Client Portal - Profile (`/api/v1/portal/profile`)

### GET /api/v1/portal/profile
**Auth:** Required | **Roles:** CLIENT

Get the client's profile.

**Response:**
```json
{
  "id": "uuid",
  "email": "...",
  "firstName": "Juan",
  "lastName": "Perez",
  "phone": "...",
  "clientProfile": {
    "clientType": "INDIVIDUAL",
    "rfc": "...",
    "companyName": null
  }
}
```

---

### PATCH /api/v1/portal/profile
**Auth:** Required | **Roles:** CLIENT

Update the client's profile.

**Body:**
```json
{
  "phone": "+52 55 9999 8888",
  "address": "Av. Reforma 456"
}
```

**Response:** Updated profile object.

---

### POST /api/v1/portal/profile/onboarding
**Auth:** Required | **Roles:** CLIENT

Complete the client onboarding process.

**Body:**
```json
{
  "rfc": "XAXX010101000",
  "address": "Av. Reforma 456",
  "acceptedTerms": true
}
```

**Response:**
```json
{ "message": "Onboarding completed", "onboardingComplete": true }
```

---

### GET /api/v1/portal/profile/onboarding-status
**Auth:** Required | **Roles:** CLIENT

Get the current onboarding status.

**Response:**
```json
{
  "onboardingComplete": true,
  "steps": {
    "profileComplete": true,
    "termsAccepted": true
  }
}
```

---

### PATCH /api/v1/portal/profile/change-password
**Auth:** Required | **Roles:** CLIENT

Change the client's password.

**Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass123!"
}
```

**Response:**
```json
{ "message": "Password changed successfully" }
```

---

## 21. PDF Generation

These endpoints are mounted under existing resource paths.

### POST /api/v1/invoices/:id/generate-pdf
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Generate and store a PDF for an invoice. See [Invoices](#8-invoices-apiv1invoices).

---

### GET /api/v1/invoices/:id/pdf
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER, CLIENT

Get presigned URL for an invoice PDF. See [Invoices](#8-invoices-apiv1invoices).

---

### POST /api/v1/cases/:id/generate-summary
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Generate a case summary PDF. See [Cases](#3-cases-apiv1cases).

---

## 22. CFDI (Mexican e-invoicing)

Endpoints for CFDI (Comprobante Fiscal Digital por Internet) operations, mounted under `/api/v1/invoices`.

### POST /api/v1/invoices/:id/cfdi/stamp
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Stamp (timbrar) a CFDI for an invoice with the Mexican tax authority (SAT).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Body:**
```json
{
  "usoCfdi": "G03",
  "formaPago": "03",
  "metodoPago": "PUE",
  "regimenFiscal": "601"
}
```

**Response:**
```json
{
  "uuid": "cfdi-uuid",
  "xml": "<?xml ...",
  "stampedAt": "2026-07-01T...",
  "status": "STAMPED"
}
```

---

### POST /api/v1/invoices/:id/cfdi/cancel
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN

Cancel a CFDI for an invoice.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Body:**
```json
{
  "reason": "01",
  "substitutionUuid": "uuid-of-replacement-cfdi"
}
```

**Response:**
```json
{
  "status": "CANCELLED",
  "cancelledAt": "2026-07-01T..."
}
```

---

### GET /api/v1/invoices/:id/cfdi/status
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER

Get the CFDI status for an invoice.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:**
```json
{
  "cfdiUuid": "...",
  "status": "STAMPED",
  "stampedAt": "2026-07-01T..."
}
```

---

### GET /api/v1/invoices/:id/cfdi/xml
**Auth:** Required | **Roles:** SUPER_ADMIN, ADMIN, LAWYER, CLIENT

Download the CFDI XML file for an invoice.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Invoice ID   |

**Response:**
```json
{
  "xml": "<?xml version=\"1.0\" ...>",
  "filename": "CFDI-INV-2026-0001.xml"
}
```

---

## 23. Signatures (`/api/v1/signatures`)

### GET /api/v1/signatures
**Auth:** Required | **Roles:** ADMIN, LAWYER

List all signature requests with filters.

**Query (extends PaginationQueryDto):**

| Param        | Type   | Description              |
|--------------|--------|--------------------------|
| `status`     | enum   | PENDING, SIGNED, EXPIRED |
| `documentId` | UUID   | Filter by document       |
| `caseId`     | UUID   | Filter by case           |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "documentId": "uuid", "status": "PENDING", "signerEmail": "..." }
  ],
  "meta": { "total": 5 }
}
```

---

### POST /api/v1/signatures
**Auth:** Required | **Roles:** ADMIN, LAWYER

Create a new signature request.

**Body:**
```json
{
  "documentId": "uuid",
  "signerEmail": "signer@example.com",
  "signerName": "Juan Perez",
  "message": "Please sign this document",
  "expiresAt": "2026-08-01T00:00:00Z"
}
```

**Response:** Created signature request with signing URL.

---

### GET /api/v1/signatures/:id
**Auth:** Required | **Roles:** ADMIN, LAWYER

Get signature request by ID.

**Params:**

| Param | Type | Description           |
|-------|------|-----------------------|
| `id`  | UUID | Signature request ID  |

**Response:** Signature request object with status history.

---

## 24. Signature Webhooks (`/api/v1/webhooks/signatures`)

### POST /api/v1/webhooks/signatures
**Auth:** Public (HMAC signature verified) | **Roles:** N/A

Handle signature provider webhook callbacks. Verifies HMAC-SHA256 signature using `x-signature` and `x-timestamp` headers.

**Headers:**

| Header        | Description                       |
|---------------|-----------------------------------|
| `x-signature` | HMAC-SHA256 hex digest            |
| `x-timestamp` | Unix timestamp of the request     |

**Body:** Provider-specific webhook payload (varies).

**Response:**
```json
{ "received": true }
```

---

## 25. Webhooks (`/api/v1/webhooks`)

All endpoints require ADMIN or SUPER_ADMIN role.

### GET /api/v1/webhooks
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

List all webhook endpoints.

**Query (extends PaginationQueryDto):**

| Param      | Type    | Description              |
|------------|---------|--------------------------|
| `isActive` | boolean | Filter active/inactive   |
| `event`    | string  | Filter by event type     |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "url": "https://...", "events": ["case.updated"], "isActive": true }
  ],
  "meta": { "total": 3 }
}
```

---

### POST /api/v1/webhooks
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

Create a new webhook endpoint.

**Body:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["case.created", "case.updated", "invoice.paid"],
  "description": "External system integration"
}
```

**Response:** Created webhook object (includes generated `secret`).

---

### GET /api/v1/webhooks/:id
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

Get webhook endpoint by ID (includes the signing secret).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Webhook ID   |

**Response:** Webhook object with secret.

---

### PATCH /api/v1/webhooks/:id
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

Update a webhook endpoint (URL, events, active status).

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Webhook ID   |

**Body:** Partial webhook fields.

**Response:** Updated webhook object.

---

### DELETE /api/v1/webhooks/:id
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

Soft-delete a webhook endpoint.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Webhook ID   |

**Response:** `204 No Content`

---

### GET /api/v1/webhooks/:id/deliveries
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

Get delivery history for a webhook endpoint.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Webhook ID   |

**Query:** Standard PaginationQueryDto.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "event": "case.updated",
      "statusCode": 200,
      "responseTime": 150,
      "deliveredAt": "..."
    }
  ],
  "meta": { "total": 25 }
}
```

---

### POST /api/v1/webhooks/:id/test
**Auth:** Required | **Roles:** ADMIN, SUPER_ADMIN

Send a test ping to a webhook endpoint.

**Params:**

| Param | Type | Description  |
|-------|------|--------------|
| `id`  | UUID | Webhook ID   |

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "responseTime": 120
}
```

---

## 26. Health (`/health`)

Health check endpoints (no `/api/v1` prefix -- mounted at root).

### GET /health
**Auth:** Public | **Roles:** Any

Liveness check. Returns database connectivity status.

**Response:**
```json
{
  "status": "ok",
  "info": { "database": { "status": "up" } }
}
```

---

### GET /health/ready
**Auth:** Public | **Roles:** Any

Readiness check. Verifies database, Redis, and storage connectivity.

**Response:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "storage": { "status": "up" }
  }
}
```

---

### GET /health/detailed
**Auth:** Required | **Roles:** ADMIN

Detailed health check with response times.

**Response:**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up", "responseTime": 5 },
    "redis": { "status": "up" },
    "storage": { "status": "up" }
  }
}
```

---

## 27. Search (`/api/v1/search`)

### GET /api/v1/search
**Auth:** Required | **Roles:** Any

Global full-text search across cases, documents, and notes.

**Query:**

| Param      | Type   | Required | Description                                         |
|------------|--------|----------|-----------------------------------------------------|
| `q`        | string | Yes      | Search query                                        |
| `entities` | string | No       | Comma-separated list: `cases`, `documents`, `notes` |
| `limit`    | number | No       | Results per entity (default 10)                     |

**Response:**
```json
{
  "cases": [ { "id": "uuid", "caseNumber": "...", "title": "..." } ],
  "documents": [ { "id": "uuid", "title": "..." } ],
  "notes": [ { "id": "uuid", "content": "..." } ],
  "meta": { "totalResults": 15, "query": "contrato" }
}
```
