# Package Architecture Reference

Load this before recommending, creating, or changing Spring Boot package structure.

## Inspection Before Recommendation

- Detect whether the project is a monolith, modular monolith, microservice system, or small demo.
- Identify current package ownership, feature names, common/shared code, security, database, tests, and frontend structure.
- Prefer the existing working style unless it is clearly harmful.
- Do not rename packages, entities, APIs, database tables, or frontend routes without checking impact.

## Default Recommendation

For most professional Spring Boot business applications, recommend:

```text
common + feature-based modules + sub-features for large domains
```

Example:

```text
com.bedata.inventory
+-- common
+-- auth
+-- user
+-- role
+-- inventory
|   +-- product
|   +-- stock
|   +-- warehouse
+-- sales
|   +-- customer
|   +-- order
+-- integration
```

## Preferred Structure

```text
com.company.project
+-- common
|   +-- config
|   +-- exception
|   +-- security
|   +-- response
|   +-- pagination
|   +-- audit
|   +-- util
|   +-- constants
+-- auth
|   +-- controller
|   +-- service
|   +-- repository
|   +-- entity
|   +-- dto
|   +-- mapper
|   +-- validator
+-- user
|   +-- controller
|   +-- service
|   +-- repository
|   +-- entity
|   +-- dto
|   +-- mapper
|   +-- specification
+-- role
|   +-- controller
|   +-- service
|   +-- repository
|   +-- entity
|   +-- dto
|   +-- mapper
|   +-- specification
+-- inventory
|   +-- product
|   |   +-- controller
|   |   +-- service
|   |   +-- repository
|   |   +-- entity
|   |   +-- dto
|   |   +-- mapper
|   +-- category
|   +-- stock
|   +-- warehouse
+-- sales
|   +-- customer
|   +-- order
|   +-- invoice
|   +-- payment
+-- integration
|   +-- email
|   +-- sms
|   +-- payment
|   +-- ai
|   +-- storage
+-- ProjectApplication.java
```

## Ranking

1. Feature-Based / Vertical Slice Structure: best default for professional business apps with clear feature ownership.
2. Domain-Driven Design Structure: best for complex enterprise systems with strong workflows and bounded contexts.
3. Clean Architecture / Hexagonal Architecture: best for long-term maintainability, testability, and framework independence.
4. Modular Monolith Structure: best for large systems before moving to microservices, using `api`, `application`, `domain`, and `infrastructure` boundaries.
5. Layer-Based Structure: acceptable only for small CRUD apps, tutorials, and simple demos.
6. Microservice Multi-Project Structure: use only for separate deployment, scaling, ownership, and operational maturity.
7. Over-Split Technical Structure: avoid structures that scatter business features across many technical packages without ownership.

## Migration Rule

- Improve structure incrementally around the feature being touched.
- Do not perform broad package moves unless the user explicitly asks for architecture migration.
- Before architecture changes, explain risk: imports, component scanning, tests, API routes, persistence mappings, migrations, documentation, and deployment scripts may be affected.
