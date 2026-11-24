# Custom Workflow Web App

A modular business management platform for project-based companies, built with **Node.js, Express and MongoDB**. Every important record moves through a **configurable, multi-level approval workflow** with remarks, signatures and a full audit trail, and approvers are notified in real time.

The React front end lives in a separate repository: [frontendforWebApp](https://github.com/ANAYAK06/frontendforWebApp).

## What it does

| Module | Main features |
|---|---|
| **Project** | Tender and proposal register, Bill of Quantities (BOQ) upload from Excel, rate revisions with full history, submission to the client, won/lost result with competitor prices, and the client purchase order linked to a cost centre with a billing plan |
| **Accounts** | Account groups and ledgers, bank accounts, loans, fixed deposits, TDS, clients |
| **Cost centres and budgets** | Cost centres by type, cost-centre budgets, DCA and sub-DCA budgets |
| **Inventory** | Item codes, units, specification codes, material requisitions |
| **Tax** | HSN / SAC codes |
| **Administration** | Users, roles, menu permissions, user cost-centre access, dashboard preferences |

### The tender-to-order flow

```
Business Opportunity -> BOQ -> (Rate Revision) -> Client BOQ -> Tender Final Status -> Client PO
                                                               (Won / Lost)          (cost centre)
```

Each stage has its own approval chain. Approvers must enter remarks; rejecting a stage reopens the previous one so the work can be redone. A detailed business description is in [`backend/Project_Module_Overview.md`](backend/Project_Module_Overview.md).

## Architecture

- **API:** Express REST API grouped by module (`routes/`, `controllers/`, `models/`, plus `ProjectModule/`, `AccountsModule/`, `InventoryModule/`, `TaxModule/`).
- **Data:** MongoDB with Mongoose schemas, validation hooks and automatic document numbering (for example `EPPL/2026/0007`).
- **Workflow engine:** document types and their approval paths are defined in `config/workflowConfig.js`; each action stores remarks and a signature for the audit trail.
- **Real-time notifications:** Server-Sent Events (`/see/notification`) push the pending-approval count to each role as soon as something needs their attention.
- **Security:** JWT authentication (`middlewares/requireAuth.js`) and bcrypt password hashing; role-based menus and cost-centre access.
- **Files:** Excel and PDF uploads with Multer, validated by type and size (`config/fileConfig.js`).
- **Business rules:** pure, unit-tested functions in `utils/businessRules.js` (joint-venture validation, opportunity numbering, won-tender amounts).

## Running locally

Requirements: Node.js 22 or later and a local MongoDB.

```bash
cd backend
npm install
cp .env.example .env      # then fill in your own values
npm start                 # API on the PORT from .env
```

## Tests

```bash
cd backend
npm test
```

Tests use Node's built-in test runner and cover the business rules, JWT authentication middleware and workflow configuration. They also run automatically on every push and pull request through GitHub Actions.

## Tech stack

Node.js · Express · MongoDB / Mongoose · JWT · bcrypt · Multer · SheetJS (xlsx) · Server-Sent Events · Node test runner · GitHub Actions
