Here’s how to use your `spring-flow` skill.

**How To Trigger It**
Use it by name in your prompt:

```text
Use spring-flow to add a user management feature.
```

or:

```text
Use the spring-flow skill and inspect this project before planning the feature.
```

Good trigger examples:

```text
Use spring-flow to create a README for this project.
```

```text
Use spring-flow to add a backend API and matching React page for products.
```

```text
Use spring-flow to review the current package structure and suggest improvements.
```

```text
Use spring-flow to implement users CRUD with Spring Boot and Vite React TypeScript.
```

**Recommended Prompt Pattern**
For new features, write:

```text
Use spring-flow.

Feature: Product management
Goal: Admin can create, update, list, and delete products.
Backend: Spring Boot API
Frontend: Vite React TypeScript page
Requirements:
- product name is required
- price must be positive
- list should support pagination
- use existing UI and API patterns
```

**What The Skill Will Do**
It should guide the agent to:

- inspect the repo first
- detect backend/frontend structure
- follow current project patterns
- align backend feature packages with frontend feature folders
- use Spring Boot controller/service/repository/DTO/mapper/validator patterns
- use TanStack Router, TanStack Query, and Axios properly
- avoid unnecessary dependencies
- produce concise plans and focused changes
- update README/docs when requested

**Useful Commands**
You can manually run the project inspector:

```powershell
python .github/skills/spring-flow/scripts/inspect_project.py
```

It prints a Markdown snapshot of backend, frontend, dependencies, routing, state management, API patterns, security/database hints, and package layout.

**Best Way To Ask**
For planning only:

```text
Use spring-flow and create an implementation plan for adding orders.
Do not edit files yet.
```

For implementation:

```text
Use spring-flow and implement the orders feature.
Inspect the project first, then update only required backend/frontend files.
```

For README:

```text
Use spring-flow to generate a professional README based only on the actual project structure.
```

**Tip**
Mention the business feature name clearly, like `users`, `products`, `orders`, or `inventory`, because the skill is designed around feature-based backend/frontend alignment.