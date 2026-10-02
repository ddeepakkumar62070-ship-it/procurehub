# Testing strategy

## Test layers

- **Unit tests** isolate a function or service with database, Redis, queue, and payment-provider boundaries mocked. Use them for state-machine transitions, business rules, validators, error paths, arithmetic, and utility functions. They are fast and make edge cases inexpensive to enumerate.
- **HTTP/API integration tests** exercise Express routes through Supertest while mocking persistence. They verify middleware composition, authentication/roles, input validation, endpoint responses, and that ownership identifiers are passed to services. Existing suites such as `auth.test.js`, `catalog.test.js`, `purchaseRequests.test.js`, `quotations.test.js`, `orders.test.js`, `invoices.test.js`, and `phase12Admin.test.js` cover these seams.
- **PostgreSQL integration tests** execute services against PostgreSQL with the real migrations and multiple connections. Reserve these for constraints, transaction boundaries, query ownership filters, token persistence, expiry, idempotency, and concurrency behavior that mocks cannot prove.

## Critical regression coverage

| Risk | Coverage |
| --- | --- |
| Two buyers competing for the same stock | `inventoryReservation.integration.test.js` makes simultaneous PostgreSQL reservations and verifies exactly one succeeds without negative inventory. |
| Duplicate order request | `idempotency.integration.test.js` checks first request, replay, mismatched body, and concurrent duplicate requests against a unique database constraint. |
| Expired quotation | `authorization.integration.test.js` verifies expiry persistence and refusal to accept; quotation unit/service tests cover lifecycle branches. |
| Invalid order transition | `orderStateMachine.test.js`, `orderTransitionService.test.js`, and `orders.test.js`. |
| Unauthorized access and admin-only APIs | `auth.test.js`, `orders.test.js`, `phase12Admin.test.js`, `phase12SupplierDisputes.test.js`, and related route tests. |
| Supplier reading or changing another supplier’s private data | `authorization.integration.test.js` checks actual PostgreSQL ownership filters for listings and mutations. |
| Buyer accepting another buyer’s quotation | `authorization.integration.test.js` checks ownership against the migrated PostgreSQL schema and confirms no state change. |
| Payments | `payments.integration.test.js` verifies persisted partial/full payments, invoice/order state updates, and supplier denial in PostgreSQL; `invoiceService.test.js` covers balance validation and safe provider response fields. |

## Test database

Create a dedicated PostgreSQL database with `test` as a complete name segment, for example `procurehub_test`. Set `TEST_DATABASE_URL` in the shell (or `backend/.env`) to its connection URL, then run:

```sh
npm --prefix backend run test:integration
```

The setup command applies unapplied SQL migrations to that database. It refuses database names without a separate `test` segment and never drops the database. PostgreSQL integration specs require `TEST_DATABASE_URL`; their schemas/fixtures are cleaned up after runs. Do not point this variable at development, staging, or production data.

Fast tests and route/API tests run without PostgreSQL:

```sh
npm --prefix backend test
```

## Coverage report

Generate Jest text and HTML coverage reports:

```sh
npm --prefix backend run test:coverage
```

The HTML report is written to `backend/coverage/lcov-report/index.html`; the LCOV data is written to `backend/coverage/lcov.info`. Run this alongside PostgreSQL integration tests in CI so database-gated coverage is not silently skipped.

## CI expectations

Run the regular test suite and frontend build on each change. Run PostgreSQL integration tests against a disposable, migrated PostgreSQL test database in CI. Preserve the test output and coverage artifacts. Prefer deterministic fixtures, asserting both expected results and unchanged state after denied or failed operations.
