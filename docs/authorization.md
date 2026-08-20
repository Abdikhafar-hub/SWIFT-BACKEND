# Swift Doc Backend — Authorization & Two-Role RBAC

## 1. Strictly Two System Roles

The platform enforces exactly two operational roles at the architectural level:

```text
1. CLIENT
2. ADMIN
```

There are no intermediate roles (no staff, no finance officer, no reviewer). All privileged administrative operations are executed by `ADMIN` users, while external clients operate strictly within the boundaries of their personal profile and applications.

## 2. Resource Isolation Matrix

| Capability / Resource | `CLIENT` Role | `ADMIN` Role |
| :--- | :--- | :--- |
| **Self Profile** | Read & Update own profile | Read & Update any client profile |
| **Client Catalog / Directory** | ❌ Blocked (403 Forbidden) | Full Read, Search, & Management |
| **Public Service Catalog** | Full Read | Full Read, Create, Edit, Configure |
| **Applications List** | Own applications only | All organization applications |
| **Application Details** | Own application only | Any application in organization |
| **Create Application** | For own profile | For any client in organization |
| **Requirement Submission** | Submit data/docs for own app | Review, approve, reject, modify |
| **Status Transition** | ❌ Blocked (403 Forbidden) | Full lifecycle state machine control |
| **Application Assignment** | ❌ Blocked (403 Forbidden) | Reassign to any admin officer |
| **Internal Admin Notes** | ❌ Hidden from queries | Read & Create internal notes |
| **Client-Visible Notes** | Read only | Read & Create |
| **Document Upload** | Upload for own applications | Upload, replace, review, archive |
| **M-Pesa STK Push Payment** | Initiate for own invoice | Initiate or record manual cash/bank |
| **Audit Logs** | ❌ Blocked (403 Forbidden) | Full query access |

## 3. Server-Side Data Isolation Enforcement

Multi-tenant and client isolation is enforced at the database query level:
* Every query made by a `CLIENT` automatically appends `where: { clientId: req.user.clientId }`.
* Even if a client guesses or submits the UUID of another client's application, document, or payment, the query returns `404 Not Found` or `403 Forbidden`.
* Tests in `tests/integration/security.test.ts` verify that cross-client access attempts are strictly rejected.
