---
applyTo: "services/**"
---
# Instructions for Backend Services

You are working in the `services/` directory, which contains the consolidated backend.

## Service Subdirectories

- `services/api/` — The single backend API server for data synchronization

## Guidelines

- The backend exists primarily for data synchronization, NOT for business logic
- Keep the API surface minimal — thin sync endpoints, authentication, and user management
- All endpoints must be authenticated and authorized
- Use rate limiting and input validation on every endpoint
- Never store or process more data than necessary (data minimization principle)
- Encrypt all financial data at rest and in transit
- Write integration tests for all API endpoints
- Document all API endpoints with OpenAPI/Swagger specifications
- Design for horizontal scalability — stateless request handling
- Use structured logging (JSON) — NEVER log sensitive financial data
- Support graceful degradation when downstream services are unavailable
