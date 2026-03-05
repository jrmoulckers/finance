# Custom Copilot Agents — Finance

Custom agents are specialized AI personas defined in `.github/agents/`. Each agent has a specific role, set of tools, and boundaries that focus its expertise on a particular aspect of development.

## How Agents Work

1. Agent definitions live in `.github/agents/<name>.agent.md`
2. Each file contains YAML frontmatter (name, description, tools) and a Markdown body with detailed instructions
3. Copilot loads the relevant agent when invoked by name in chat (e.g., `@architect`)
4. The GitHub Copilot Coding Agent can also use these definitions when working on issues autonomously

## Available Agents

### `@architect` — System Architect

**File:** `.github/agents/architect.agent.md`

**Purpose:** Designs high-level architecture, evaluates technology choices, defines API contracts, and ensures edge-first design principles.

**When to use:**
- Making cross-platform architecture decisions
- Designing the sync protocol or API contracts
- Evaluating new technologies or dependencies
- Creating Architecture Decision Records (ADRs)
- Reviewing changes that span multiple apps or packages

**Tools:** read, edit, search, shell

---

### `@docs-writer` — Documentation Writer

**File:** `.github/agents/docs-writer.agent.md`

**Purpose:** Creates and maintains all project documentation — architecture docs, AI guides, API references, and contributor guides.

**When to use:**
- Writing or updating README files
- Creating Architecture Decision Records
- Documenting API endpoints
- Updating AI workflow documentation
- Writing onboarding guides

**Tools:** read, edit, search

---

### `@security-reviewer` — Security & Privacy Reviewer

**File:** `.github/agents/security-reviewer.agent.md`

**Purpose:** Reviews code for security vulnerabilities, privacy violations, and regulatory compliance. Critical for a financial application.

**When to use:**
- Reviewing PRs that handle financial data
- Adding authentication or authorization logic
- Integrating third-party services
- Handling encryption or key management
- Any change touching user data storage or transmission

**Tools:** read, search, shell

**Severity levels:**
- **CRITICAL** — Must fix before merge (data exposure risk)
- **HIGH** — Should fix before merge (significant weakness)
- **MEDIUM** — Fix within sprint (defense-in-depth)
- **LOW** — Address when convenient (best practice)

---

### `@accessibility-reviewer` — Accessibility Reviewer

**File:** `.github/agents/accessibility-reviewer.agent.md`

**Purpose:** Reviews UI code for WCAG 2.2 AA compliance, platform accessibility guidelines, and inclusive design. Inspired by Tiimo's disability-inclusive approach.

**When to use:**
- Any UI component creation or modification
- Navigation flow changes
- Color/theme changes
- Adding animations or motion
- Creating forms or interactive elements

**Tools:** read, search

**Key standards:** WCAG 2.2 AA, Apple HIG Accessibility, Material Design Accessibility, WAI-ARIA

---

### `@finance-domain` — Financial Domain Expert

**File:** `.github/agents/finance-domain.agent.md`

**Purpose:** Ensures financial logic correctness — budgeting algorithms, transaction processing, currency handling, and reporting accuracy.

**When to use:**
- Implementing budgeting logic
- Handling monetary calculations
- Designing transaction processing flows
- Working on financial reporting/analytics
- Multi-currency support
- Shared/family finance features

**Tools:** read, edit, search

**Critical rule:** Never use floating point for money. Use integer cents or fixed-precision decimals.

---

## Adding a New Agent

1. Create `.github/agents/<name>.agent.md` with YAML frontmatter:
   ```yaml
   ---
   name: <agent-name>
   description: >
     Clear description of the agent's purpose and when to use it.
   tools:
     - read
     - edit
     - search
   ---
   ```
2. Write the Markdown body with: Mission, Expertise Areas, Key Responsibilities, and Boundaries
3. Update this document (`docs/ai/agents.md`) with the new agent's details
4. Test the agent by invoking it in Copilot Chat

## Best Practices

- **Invoke the right agent** — Use `@security-reviewer` for security reviews, not generic Copilot
- **Combine agents** — Ask `@architect` to design, then `@security-reviewer` to review
- **Trust but verify** — Agent output is a starting point; always review critically
- **Update agents** — As the project evolves, update agent instructions to reflect new patterns
