# Swift Doc Backend — Service Catalog & Dynamic Requirements

## 1. Kenyan Service Catalog Categories

The Swift Doc database seed initializes 7 core Kenyan service categories and real operational services:

1. **Business Registration (`CAT-BR`)**:
   * Private Limited Company Incorporation (BRS eCitizen)
   * Business Name (Sole Proprietorship / Partnership) Registration
   * Official CR12 Search & Certification
2. **KRA & Tax Services (`CAT-KRA`)**:
   * Tax Compliance Certificate (TCC)
   * KRA PIN Registration & Recovery
3. **Passport & Immigration (`CAT-IMM`)**:
   * Passport Application & Tracking (Nyayo House)
   * Kenya Electronic Travel Authorisation (eTA)
4. **Civil Registration (`CAT-CIVIL`)**:
   * Birth Certificate Application & Replacement
5. **NTSA & Motor Vehicle (`CAT-NTSA`)**:
   * Smart Driving Licence Application & Renewal
   * Logbook Transfer Coordination (TIMS)
6. **Clearance & Vetting (`CAT-CLEAR`)**:
   * Police Clearance Certificate / Good Conduct (DCI)
7. **Authentication & Legalisation (`CAT-AUTH`)**:
   * Ministry of Foreign Affairs Document Authentication

## 2. Dynamic Requirement Types

Each service defines its required inputs via `ServiceRequirement`, supporting varied data collection types:
* `DOCUMENT`: File upload (ID copies, PIN certificates, passport photos, deeds).
* `TEXT`: Free-form or structured text (proposed company names, office physical address).
* `NUMBER`: Numeric inputs (share capital, number of shares).
* `DATE`: Date pickers (date of birth, registration dates).
* `BOOLEAN`: Yes/No consents and declarations.
* `SELECT` / `MULTI_SELECT`: Enum or option selections.

## 3. Dynamic Application Forms

Clients interact with requirements on their applications via:
* `POST /api/v1/client/applications/:id/requirements/:requirementId`: Submits value text, numbers, dates, or marks requirement satisfied upon document upload.
