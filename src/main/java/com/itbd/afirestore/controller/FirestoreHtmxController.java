package com.itbd.afirestore.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.itbd.afirestore.FirestoreManagerService;
import com.itbd.afirestore.GcpProjectService;
import com.itbd.afirestore.service.GenericFirestoreService;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebSession;
import org.springframework.web.util.HtmlUtils;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Controller
@RequestMapping("/ui/firestore")
public class FirestoreHtmxController {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };
    private static final String AUTH_SERVICE_ACCOUNT_SESSION_KEY = "firestoreAuth.serviceAccountJson";

    private final GenericFirestoreService genericFirestoreService;
    private final FirestoreManagerService firestoreManagerService;
    private final GcpProjectService gcpProjectService;
    private final ObjectMapper objectMapper;

    public FirestoreHtmxController(
            GenericFirestoreService genericFirestoreService,
            FirestoreManagerService firestoreManagerService,
            GcpProjectService gcpProjectService,
            ObjectMapper objectMapper) {
        this.genericFirestoreService = genericFirestoreService;
        this.firestoreManagerService = firestoreManagerService;
        this.gcpProjectService = gcpProjectService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/pages/setup")
    public String setupPage() {
        return "firestore/pages :: setupPage";
    }

    @GetMapping("/pages/explorer")
    public String explorerPage() {
        return "firestore/pages :: explorerPage";
    }

    @GetMapping("/pages/crud")
    public String crudPage() {
        return "firestore/pages :: crudPage";
    }

    @GetMapping("/fragments/sidebar-collections")
    public Mono<String> sidebarCollections(
            @RequestParam(value = "activePath", required = false) String activePath,
            Model model) {
        String normalizedActivePath = normalize(activePath);
        return genericFirestoreService.getAllCollections()
                .map(collections -> {
                    model.addAttribute("collections", collections);
                    model.addAttribute("activePath", normalizedActivePath);
                    return "firestore/fragments :: sidebarCollections";
                })
                .onErrorResume(e -> status(model, "error", "Failed to load collections", e.getMessage()));
    }

    @GetMapping("/fragments/sidebar-nested")
    public Mono<String> sidebarNested(
            @RequestParam(value = "path", required = false) String path,
            Model model) {
        String normalizedPath = normalize(path);
        model.addAttribute("currentPath", normalizedPath);
        model.addAttribute("parentPath", parentPath(normalizedPath));
        model.addAttribute("nodeType", "empty");
        model.addAttribute("documentNodes", List.of());
        model.addAttribute("childCollectionNodes", List.of());
        model.addAttribute("nestedHint", "");
        model.addAttribute("nestedError", "");

        if (normalizedPath.isBlank()) {
            model.addAttribute("nestedHint", "Run a collection query first, then traverse nested documents and subcollections here.");
            return Mono.just("firestore/fragments :: nestedSidebar");
        }

        if (isCollectionPath(normalizedPath)) {
            return genericFirestoreService.getAllDocuments(normalizedPath)
                    .map(documents -> {
                        model.addAttribute("nodeType", "collection");
                        List<Map<String, String>> documentNodes = buildDocumentNodes(documents);
                        model.addAttribute("documentNodes", documentNodes);
                        if (documentNodes.isEmpty()) {
                            model.addAttribute("nestedHint", "No documents found under this collection.");
                        } else {
                            model.addAttribute("nestedHint", "Select a document to inspect its child collections.");
                        }
                        return "firestore/fragments :: nestedSidebar";
                    })
                    .onErrorResume(e -> {
                        model.addAttribute("nestedError", e.getMessage());
                        return Mono.just("firestore/fragments :: nestedSidebar");
                    });
        }

        return genericFirestoreService.listSubcollections(normalizedPath)
                .map(subcollections -> {
                    model.addAttribute("nodeType", "document");
                    List<Map<String, String>> childCollectionNodes = buildChildCollectionNodes(normalizedPath, subcollections);
                    model.addAttribute("childCollectionNodes", childCollectionNodes);
                    if (childCollectionNodes.isEmpty()) {
                        model.addAttribute("nestedHint", "No child collections found for this document.");
                    } else {
                        model.addAttribute("nestedHint", "Select a child collection to run a query and continue traversal.");
                    }
                    return "firestore/fragments :: nestedSidebar";
                })
                .onErrorResume(e -> {
                    model.addAttribute("nestedError", e.getMessage());
                    return Mono.just("firestore/fragments :: nestedSidebar");
                });
    }

    @GetMapping("/fragments/query-results")
    public Mono<String> queryResults(
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "whereField", required = false) List<String> whereFields,
            @RequestParam(value = "whereOperator", required = false) List<String> whereOperators,
            @RequestParam(value = "whereValue", required = false) List<String> whereValues,
            @RequestParam(value = "whereType", required = false) List<String> whereTypes,
            @RequestParam(value = "viewMode", defaultValue = "table") String viewMode,
            @RequestParam(value = "orderField", required = false) String orderField,
            @RequestParam(value = "orderDirection", defaultValue = "desc") String orderDirection,
            @RequestParam(value = "limit", defaultValue = "50") Integer limit,
            @RequestParam(value = "page", defaultValue = "0") Integer page,
            Model model) {
        int safeLimit = Math.max(1, Math.min(limit == null ? 50 : limit, 500));
        int safePage = Math.max(0, page == null ? 0 : page);
        String normalizedOrderField = normalize(orderField);
        String normalizedOrderDirection = "asc".equalsIgnoreCase(orderDirection) ? "asc" : "desc";
        String normalizedViewMode = normalizeViewMode(viewMode);
        String normalizedPath = normalize(path);
        List<GenericFirestoreService.WhereClause> whereClauses;
        try {
            whereClauses = buildWhereClauses(whereFields, whereOperators, whereValues, whereTypes);
        } catch (RuntimeException e) {
            return status(model, "error", "Invalid where filter", e.getMessage());
        }

        Mono<String> effectivePathMono = normalizedPath.isBlank()
                ? genericFirestoreService.getAllCollections()
                  .flatMap(collections -> {
                      if (collections.isEmpty()) {
                          return Mono.empty();
                      }
                      return Mono.just(collections.getFirst());
                  })
                : Mono.just(normalizedPath);

        return effectivePathMono
                .switchIfEmpty(status(model, "warning", "No collections found", "Initialize Firestore and create at least one collection."))
                .flatMap(effectivePath -> {
                    if (effectivePath.startsWith("firestore/fragments")) {
                        return Mono.just(effectivePath);
                    }
                    if (!isCollectionPath(effectivePath)) {
                        return status(model, "error", "Collection path required", "Path must contain odd path segments (collection path).");
                    }

                    return genericFirestoreService.queryCollection(
                                    effectivePath,
                                    whereClauses,
                                    normalizedOrderField,
                                    normalizedOrderDirection,
                                    safeLimit,
                                    safePage)
                            .map(result -> {
                                int pageStart = result.documents().isEmpty()
                                        ? 0
                                        : (result.pageIndex() * result.pageSize()) + 1;
                                int pageEnd = (result.pageIndex() * result.pageSize()) + result.documents().size();
                                model.addAttribute("queryPath", "/" + effectivePath);
                                model.addAttribute("activePath", effectivePath);
                                model.addAttribute("documents", result.documents());
                                model.addAttribute("treeDocuments", buildTreeDocuments(result.documents()));
                                model.addAttribute("jsonDocuments", buildJsonDocuments(result.documents()));
                                model.addAttribute("columns", buildColumns(result.documents()));
                                model.addAttribute("resultCount", result.documents().size());
                                model.addAttribute("elapsedMs", result.elapsedMs());
                                model.addAttribute("viewMode", normalizedViewMode);
                                model.addAttribute("pageIndex", result.pageIndex());
                                model.addAttribute("pageSize", result.pageSize());
                                model.addAttribute("hasNextPage", result.hasNextPage());
                                model.addAttribute("hasPreviousPage", result.pageIndex() > 0);
                                model.addAttribute("pageStart", pageStart);
                                model.addAttribute("pageEnd", pageEnd);
                                return "firestore/fragments :: queryResults";
                            })
                            .onErrorResume(e -> status(model, "error", "Query failed", e.getMessage()));
                })
                .onErrorResume(e -> status(model, "error", "Query failed", e.getMessage()));
    }

    @GetMapping("/fragments/databases")
    public Mono<String> databases(Model model) {
        return genericFirestoreService.getAllDatabases()
                .map(databases -> {
                    model.addAttribute("databases", databases);
                    return "firestore/fragments :: databases";
                })
                .onErrorResume(e -> status(model, "error", "Failed to load databases", e.getMessage()));
    }

    @GetMapping("/fragments/collections")
    public Mono<String> collections(Model model) {
        return genericFirestoreService.getAllCollections()
                .map(collections -> {
                    model.addAttribute("collections", collections);
                    return "firestore/fragments :: collections";
                })
                .onErrorResume(e -> status(model, "error", "Failed to load collections", e.getMessage()));
    }

    @GetMapping("/fragments/explore")
    public Mono<String> explore(@RequestParam("path") String path, Model model) {
        String normalizedPath = normalize(path);
        if (normalizedPath.isBlank()) {
            return status(model, "error", "Path is required", "Use a collection path or document path.");
        }

        if (isCollectionPath(normalizedPath)) {
            return genericFirestoreService.getAllDocuments(normalizedPath)
                    .map(documents -> {
                        model.addAttribute("path", normalizedPath);
                        model.addAttribute("isCollection", true);
                        model.addAttribute("documents", documents);
                        return "firestore/fragments :: exploreResult";
                    })
                    .onErrorResume(e -> status(model, "error", "Failed to read collection", e.getMessage()));
        }

        return genericFirestoreService.getDocument(normalizedPath)
                .map(document -> {
                    model.addAttribute("path", normalizedPath);
                    model.addAttribute("isCollection", false);
                    model.addAttribute("document", document);
                    return "firestore/fragments :: exploreResult";
                })
                .switchIfEmpty(status(model, "warning", "Document not found", normalizedPath))
                .onErrorResume(e -> status(model, "error", "Failed to read document", e.getMessage()));
    }

    @PostMapping("/actions/init")
    public Mono<String> initialize(
            @RequestParam("projectId") String projectId,
            @RequestParam(value = "databaseId", required = false) String databaseId,
            @RequestParam("serviceAccountJson") String serviceAccountJson,
            Model model) {
        return Mono.fromCallable(() -> {
                    firestoreManagerService.initializeFirestore(projectId.trim(), normalize(databaseId), serviceAccountJson);
                    return "Firestore initialized for project '" + projectId.trim() + "'";
                })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(msg -> status(model, "success", msg, null))
                .onErrorResume(e -> status(model, "error", "Initialization failed", e.getMessage()));
    }

    @PostMapping("/actions/projects")
    public Mono<String> listProjects(@RequestParam("serviceAccountJson") String serviceAccountJson, Model model) {
        return Mono.fromCallable(() -> gcpProjectService.listAvailableProjects(serviceAccountJson))
                .subscribeOn(Schedulers.boundedElastic())
                .map(projects -> {
                    model.addAttribute("projects", projects);
                    return "firestore/fragments :: projects";
                })
                .onErrorResume(e -> status(model, "error", "Failed to list projects", e.getMessage()));
    }

    @PostMapping(value = "/actions/auth/projects", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<String> authProjects(@RequestPart("credentialsFile") FilePart credentialsFile, Model model, WebSession session) {
        return readUploadedJsonFile(credentialsFile)
                .flatMap(serviceAccountJson -> Mono.fromCallable(() -> loadAuthBootstrapData(serviceAccountJson))
                        .subscribeOn(Schedulers.boundedElastic())
                        .map(authBootstrap -> {
                            session.getAttributes().put(AUTH_SERVICE_ACCOUNT_SESSION_KEY, serviceAccountJson);
                            model.addAttribute("uploadedFileName", credentialsFile.filename());
                            model.addAttribute("projects", authBootstrap.projects());
                            model.addAttribute("selectedProjectId", authBootstrap.selectedProjectId());
                            model.addAttribute("databases", authBootstrap.databases());
                            model.addAttribute("selectedDatabase", "");
                            model.addAttribute("databaseHint", authBootstrap.databaseHint());

                            if (authBootstrap.projects().isEmpty()) {
                                model.addAttribute("type", "warning");
                                model.addAttribute("message", "No projects available");
                                model.addAttribute("details", "The uploaded credentials can be read, but no accessible project ID was found.");
                            } else {
                                model.addAttribute("type", "success");
                                model.addAttribute("message", "Projects loaded");
                                model.addAttribute("details", authBootstrap.projects().size() + " project ID(s) discovered.");
                            }

                            return "firestore/fragments :: authProjectSelector";
                        }))
                .onErrorResume(e -> {
                    model.addAttribute("type", "error");
                    model.addAttribute("message", "Failed to load credentials");
                    model.addAttribute("details", e.getMessage());
                    return Mono.just("firestore/fragments :: authProjectSelector");
                });
    }

    @PostMapping("/actions/auth/databases")
    public Mono<String> authDatabases(
            @RequestParam(value = "projectId", required = false) String projectId,
            @RequestParam(value = "value", required = false) String fallbackProjectId,
            @RequestParam(value = "serviceAccountJson", required = false) String serviceAccountJson,
            Model model,
            WebSession session,
            ServerWebExchange exchange) {
        return exchange.getFormData().flatMap(formData -> {
            String requestedProjectId = normalize(firstNonBlank(
                    projectId,
                    formData.getFirst("projectId"),
                    fallbackProjectId,
                    formData.getFirst("value")));
            String effectiveServiceAccountJson = firstNonBlank(
                    serviceAccountJson,
                    formData.getFirst("serviceAccountJson"));
            String rawServiceAccountJson = resolveServiceAccountJson(effectiveServiceAccountJson, session);

            if (requestedProjectId.isBlank()) {
                model.addAttribute("databases", List.of());
                model.addAttribute("selectedDatabase", "");
                model.addAttribute("databaseHint", "Select a project ID to load databases. '(default)' remains selected.");
                return Mono.just("firestore/fragments :: authDatabaseSelector");
            }

            if (rawServiceAccountJson.isEmpty()) {
                model.addAttribute("databases", List.of());
                model.addAttribute("selectedDatabase", "");
                model.addAttribute("databaseHint", "Credential payload missing. Upload client_secrets.json again. '(default)' remains selected.");
                return Mono.just("firestore/fragments :: authDatabaseSelector");
            }

            return Mono.fromCallable(() -> sanitizeDatabaseIds(
                            firestoreManagerService.listAvailableDatabases(requestedProjectId, rawServiceAccountJson)))
                    .subscribeOn(Schedulers.boundedElastic())
                    .map(databases -> {
                        model.addAttribute("databases", databases);
                        model.addAttribute("selectedDatabase", "");
                        if (databases.isEmpty()) {
                            model.addAttribute("databaseHint", "No specific database IDs found for '" + requestedProjectId + "'. '(default)' remains selected.");
                        } else {
                            model.addAttribute("databaseHint", "Choose a database ID or keep '(default)'.");
                        }
                        return "firestore/fragments :: authDatabaseSelector";
                    })
                    .onErrorResume(e -> {
                        model.addAttribute("databases", List.of());
                        model.addAttribute("selectedDatabase", "");
                        model.addAttribute("databaseHint", "Could not load databases for '" + requestedProjectId + "'. '(default)' remains selected.");
                        return Mono.just("firestore/fragments :: authDatabaseSelector");
                    });
        });
    }

    @PostMapping("/actions/auth/init")
    public Mono<String> authInit(
            @RequestParam(value = "projectId", required = false) String projectId,
            @RequestParam(value = "databaseId", required = false) String databaseId,
            @RequestParam(value = "serviceAccountJson", required = false) String serviceAccountJson,
            Model model,
            WebSession session,
            ServerWebExchange exchange) {
        return exchange.getFormData().flatMap(formData -> {
            String normalizedProjectId = normalize(firstNonBlank(projectId, formData.getFirst("projectId")));
            String normalizedDatabaseId = normalize(firstNonBlank(databaseId, formData.getFirst("databaseId")));
            String effectiveServiceAccountJson = firstNonBlank(serviceAccountJson, formData.getFirst("serviceAccountJson"));
            String rawServiceAccountJson = resolveServiceAccountJson(effectiveServiceAccountJson, session);

            if (normalizedProjectId.isBlank()) {
                model.addAttribute("type", "error");
                model.addAttribute("message", "Project ID is required");
                model.addAttribute("details", "Select a project ID from the list.");
                model.addAttribute("authenticated", false);
                return Mono.just("firestore/fragments :: authInitResult");
            }
            if (rawServiceAccountJson.isEmpty()) {
                model.addAttribute("type", "error");
                model.addAttribute("message", "Credential payload missing");
                model.addAttribute("details", "Upload client_secrets.json again and reload the project list.");
                model.addAttribute("authenticated", false);
                return Mono.just("firestore/fragments :: authInitResult");
            }

            return Mono.fromCallable(() -> {
                        firestoreManagerService.initializeFirestore(normalizedProjectId, normalizedDatabaseId, rawServiceAccountJson);
                        return normalizedProjectId;
                    })
                    .subscribeOn(Schedulers.boundedElastic())
                    .map(connectedProjectId -> {
                        model.addAttribute("type", "success");
                        model.addAttribute("message", "Authentication successful");
                        model.addAttribute("details", "Firestore initialized for project '" + connectedProjectId + "'.");
                        model.addAttribute("authenticated", true);
                        return "firestore/fragments :: authInitResult";
                    })
                    .onErrorResume(e -> {
                        model.addAttribute("type", "error");
                        model.addAttribute("message", "Authentication failed");
                        model.addAttribute("details", e.getMessage());
                        model.addAttribute("authenticated", false);
                        return Mono.just("firestore/fragments :: authInitResult");
                    });
        });
    }

    @PostMapping("/actions/create")
    public Mono<String> create(
            @RequestParam("collectionPath") String collectionPath,
            @RequestParam("payloadJson") String payloadJson,
            Model model) {
        String normalizedCollectionPath = normalize(collectionPath);
        if (normalizedCollectionPath.isBlank()) {
            return status(model, "error", "Collection path is required", null);
        }
        if (!isCollectionPath(normalizedCollectionPath)) {
            return status(model, "error", "Invalid collection path", "Collection path must contain odd path segments.");
        }
        return parsePayload(payloadJson)
                .flatMap(payload -> genericFirestoreService.createDocument(normalizedCollectionPath, payload))
                .flatMap(saved -> status(model, "success", "Document created", prettyJson(saved)))
                .onErrorResume(e -> status(model, "error", "Create failed", e.getMessage()));
    }

    @PostMapping("/actions/update")
    public Mono<String> update(
            @RequestParam("documentPath") String documentPath,
            @RequestParam("payloadJson") String payloadJson,
            Model model) {
        String normalizedDocumentPath = normalize(documentPath);
        if (normalizedDocumentPath.isBlank()) {
            return status(model, "error", "Document path is required", null);
        }
        if (isCollectionPath(normalizedDocumentPath)) {
            return status(model, "error", "Invalid document path", "Document path must contain even path segments.");
        }
        return parsePayload(payloadJson)
                .flatMap(payload -> genericFirestoreService.updateDocument(normalizedDocumentPath, payload))
                .flatMap(updated -> status(model, "success", "Document updated", prettyJson(updated)))
                .onErrorResume(e -> status(model, "error", "Update failed", e.getMessage()));
    }

    @PostMapping("/actions/replace")
    public Mono<String> replace(
            @RequestParam("documentPath") String documentPath,
            @RequestParam("payloadJson") String payloadJson,
            Model model) {
        String normalizedDocumentPath = normalize(documentPath);
        if (normalizedDocumentPath.isBlank()) {
            return status(model, "error", "Document path is required", null);
        }
        if (isCollectionPath(normalizedDocumentPath)) {
            return status(model, "error", "Invalid document path", "Document path must contain even path segments.");
        }
        return parsePayload(payloadJson)
                .map(this::extractEditablePayload)
                .flatMap(payload -> genericFirestoreService.replaceDocument(normalizedDocumentPath, payload))
                .flatMap(updated -> status(model, "success", "Document replaced", prettyJson(updated)))
                .onErrorResume(e -> status(model, "error", "Replace failed", e.getMessage()));
    }

    @PostMapping("/actions/delete")
    public Mono<String> delete(@RequestParam("documentPath") String documentPath, Model model) {
        String normalizedDocumentPath = normalize(documentPath);
        if (normalizedDocumentPath.isBlank()) {
            return status(model, "error", "Document path is required", null);
        }
        if (isCollectionPath(normalizedDocumentPath)) {
            return status(model, "error", "Invalid document path", "Document path must contain even path segments.");
        }
        return genericFirestoreService.deleteDocument(normalizedDocumentPath)
                .flatMap(deletedId -> status(model, "success", "Document deleted", deletedId))
                .onErrorResume(e -> status(model, "error", "Delete failed", e.getMessage()));
    }

    private List<Map<String, String>> buildColumns(List<Map<String, Object>> documents) {
        LinkedHashMap<String, String> columns = new LinkedHashMap<>();
        columns.put("id", "key");

        for (Map<String, Object> document : documents) {
            for (Map.Entry<String, Object> entry : document.entrySet()) {
                String key = entry.getKey();
                if ("id".equals(key) || key.startsWith("_")) {
                    continue;
                }
                columns.putIfAbsent(key, inferType(entry.getValue()));
            }
        }

        List<Map<String, String>> result = new ArrayList<>();
        for (Map.Entry<String, String> entry : columns.entrySet()) {
            Map<String, String> column = new LinkedHashMap<>();
            column.put("name", entry.getKey());
            column.put("type", entry.getValue());
            result.add(column);
        }
        return result;
    }

    private String inferType(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Boolean) {
            return "bool";
        }
        if (value instanceof Number) {
            return "number";
        }
        if (value instanceof Map) {
            return "object";
        }
        if (value instanceof List) {
            return "array";
        }
        if ("Timestamp".equals(value.getClass().getSimpleName())) {
            return "timestamp";
        }
        return "string";
    }

    private Object parseWhereValue(String rawValue, String whereType) {
        String normalizedType = Optional.ofNullable(whereType)
                .map(t -> t.toLowerCase(Locale.ROOT))
                .orElse("string");
        String value = rawValue == null ? "" : rawValue.trim();

        return switch (normalizedType) {
            case "bool", "boolean" -> Boolean.parseBoolean(value);
            case "number" -> parseNumber(value);
            case "null" -> null;
            default -> value;
        };
    }

    private List<GenericFirestoreService.WhereClause> buildWhereClauses(
            List<String> whereFields,
            List<String> whereOperators,
            List<String> whereValues,
            List<String> whereTypes) {
        List<GenericFirestoreService.WhereClause> clauses = new ArrayList<>();
        int maxSize = Math.max(
                Math.max(sizeOf(whereFields), sizeOf(whereOperators)),
                Math.max(sizeOf(whereValues), sizeOf(whereTypes)));

        for (int i = 0; i < maxSize; i++) {
            String field = normalize(valueAt(whereFields, i));
            if (field.isBlank()) {
                continue;
            }

            String operator = valueAt(whereOperators, i);
            if (operator == null || operator.isBlank()) {
                operator = "==";
            }

            String type = valueAt(whereTypes, i);
            if (type == null || type.isBlank()) {
                type = "string";
            }

            String rawValue = valueAt(whereValues, i);
            Object typedValue;
            try {
                typedValue = parseWhereValue(rawValue, type);
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("Failed to parse value for field '" + field + "' as " + type + ".");
            }

            clauses.add(new GenericFirestoreService.WhereClause(field, operator, typedValue));
        }
        return clauses;
    }

    private int sizeOf(List<String> values) {
        return values == null ? 0 : values.size();
    }

    private String valueAt(List<String> values, int index) {
        if (values == null || index < 0 || index >= values.size()) {
            return null;
        }
        return values.get(index);
    }

    private Number parseNumber(String raw) {
        if (raw.contains(".")) {
            return Double.parseDouble(raw);
        }
        return Long.parseLong(raw);
    }

    private String parentPath(String normalizedPath) {
        if (normalizedPath == null || normalizedPath.isBlank()) {
            return "";
        }
        String[] segments = normalizedPath.split("/");
        if (segments.length <= 1) {
            return "";
        }
        return String.join("/", Arrays.copyOf(segments, segments.length - 1));
    }

    private List<Map<String, String>> buildDocumentNodes(List<Map<String, Object>> documents) {
        List<Map<String, String>> nodes = new ArrayList<>();
        if (documents == null || documents.isEmpty()) {
            return nodes;
        }

        for (Map<String, Object> document : documents) {
            if (document == null) {
                continue;
            }
            String id = String.valueOf(document.getOrDefault("id", ""));
            String path = String.valueOf(document.getOrDefault("_path", ""));
            if (id.isBlank() || path.isBlank()) {
                continue;
            }
            Map<String, String> node = new LinkedHashMap<>();
            node.put("id", id);
            node.put("path", path);
            nodes.add(node);
        }
        return nodes;
    }

    private List<Map<String, String>> buildChildCollectionNodes(String documentPath, List<String> subcollections) {
        List<Map<String, String>> nodes = new ArrayList<>();
        if (documentPath == null || documentPath.isBlank() || subcollections == null || subcollections.isEmpty()) {
            return nodes;
        }

        for (String childCollection : subcollections) {
            String childId = normalize(childCollection);
            if (childId.isBlank()) {
                continue;
            }
            Map<String, String> node = new LinkedHashMap<>();
            node.put("id", childId);
            node.put("path", documentPath + "/" + childId);
            nodes.add(node);
        }
        return nodes;
    }

    private String normalizeViewMode(String rawViewMode) {
        if (rawViewMode == null) {
            return "table";
        }
        String normalized = rawViewMode.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "tree" -> "tree";
            case "json" -> "json";
            default -> "table";
        };
    }

    private List<Map<String, Object>> buildTreeDocuments(List<Map<String, Object>> documents) {
        List<Map<String, Object>> treeDocuments = new ArrayList<>();
        if (documents == null || documents.isEmpty()) {
            return treeDocuments;
        }

        for (Map<String, Object> document : documents) {
            Map<String, Object> entry = new LinkedHashMap<>();
            Object idValue = document == null ? null : document.get("id");
            Object pathValue = document == null ? null : document.get("_path");
            entry.put("id", idValue == null ? "" : String.valueOf(idValue));
            entry.put("path", pathValue == null ? "" : String.valueOf(pathValue));
            entry.put("treeHtml", renderTreeHtmlForDocument(document));
            entry.put("editableJson", prettyJson(extractEditablePayload(document)));
            treeDocuments.add(entry);
        }
        return treeDocuments;
    }

    private List<Map<String, Object>> buildJsonDocuments(List<Map<String, Object>> documents) {
        List<Map<String, Object>> jsonDocuments = new ArrayList<>();
        if (documents == null || documents.isEmpty()) {
            return jsonDocuments;
        }

        for (Map<String, Object> document : documents) {
            Map<String, Object> entry = new LinkedHashMap<>();
            Object idValue = document == null ? null : document.get("id");
            Object pathValue = document == null ? null : document.get("_path");
            Map<String, Object> effectiveDocument = document == null ? Collections.emptyMap() : document;
            entry.put("id", idValue == null ? "" : String.valueOf(idValue));
            entry.put("path", pathValue == null ? "" : String.valueOf(pathValue));
            entry.put("json", prettyJson(effectiveDocument));
            entry.put("treeHtml", renderTreeHtmlForDocument(effectiveDocument));
            entry.put("editableJson", prettyJson(extractEditablePayload(effectiveDocument)));
            jsonDocuments.add(entry);
        }
        return jsonDocuments;
    }

    private String renderTreeHtmlForDocument(Map<String, Object> document) {
        if (document == null) {
            return "";
        }

        Map<String, Object> root = new LinkedHashMap<>();
        if (document.containsKey("id")) {
            root.put("id", document.get("id"));
        }
        for (Map.Entry<String, Object> entry : document.entrySet()) {
            String key = entry.getKey();
            if (key == null || key.startsWith("_") || "id".equals(key)) {
                continue;
            }
            root.put(key, entry.getValue());
        }

        StringBuilder html = new StringBuilder();
        html.append("<div class=\"json-tree-root\">")
                .append("<ul class=\"json-tree-list\">");
        for (Map.Entry<String, Object> entry : root.entrySet()) {
            appendTreeNode(html, entry.getKey(), entry.getValue(), 0);
        }
        html.append("</ul></div>");
        return html.toString();
    }

    private Map<String, Object> extractEditablePayload(Map<String, Object> document) {
        Map<String, Object> editable = new LinkedHashMap<>();
        if (document == null || document.isEmpty()) {
            return editable;
        }

        for (Map.Entry<String, Object> entry : document.entrySet()) {
            String key = entry.getKey();
            if (key == null || key.startsWith("_") || "id".equals(key)) {
                continue;
            }
            editable.put(key, toEditableJsonValue(entry.getValue()));
        }
        return editable;
    }

    private Object toEditableJsonValue(Object value) {
        if (value == null || value instanceof String || value instanceof Number || value instanceof Boolean) {
            return value;
        }
        if (value instanceof Map<?, ?> mapValue) {
            Map<String, Object> normalized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> nested : mapValue.entrySet()) {
                normalized.put(String.valueOf(nested.getKey()), toEditableJsonValue(nested.getValue()));
            }
            return normalized;
        }
        if (value instanceof List<?> listValue) {
            List<Object> normalized = new ArrayList<>(listValue.size());
            for (Object item : listValue) {
                normalized.add(toEditableJsonValue(item));
            }
            return normalized;
        }
        return String.valueOf(value);
    }

    private void appendTreeNode(StringBuilder html, String key, Object value, int depth) {
        String safeKey = HtmlUtils.htmlEscape(key == null ? "" : key);
        if (value instanceof Map<?, ?> mapValue) {
            appendObjectNode(html, safeKey, mapValue, depth);
            return;
        }

        if (value instanceof List<?> listValue) {
            appendArrayNode(html, safeKey, listValue, depth);
            return;
        }

        appendScalarNode(html, safeKey, value);
    }

    private void appendObjectNode(StringBuilder html, String safeKey, Map<?, ?> mapValue, int depth) {
        html.append("<li class=\"json-tree-item\">");
        if (mapValue.isEmpty()) {
            html.append("<div class=\"json-tree-leaf\">")
                    .append("<span class=\"json-tree-key\">")
                    .append(safeKey)
                    .append("</span>")
                    .append("<span class=\"json-tree-colon\">:</span>")
                    .append("<span class=\"json-tree-bracket\">{}</span>")
                    .append("</div>")
                    .append("</li>");
            return;
        }

        html.append("<details class=\"json-tree-group\"");
        if (depth == 0) {
            html.append(" open");
        }
        html.append(">")
                .append("<summary class=\"json-tree-summary\">")
                .append("<span class=\"json-tree-key\">")
                .append(safeKey)
                .append("</span>")
                .append("<span class=\"json-tree-colon\">:</span>")
                .append("<span class=\"json-tree-bracket\">{</span>")
                .append("<span class=\"json-tree-meta\">")
                .append(mapValue.size())
                .append(mapValue.size() == 1 ? " key" : " keys")
                .append("</span>")
                .append("<span class=\"json-tree-bracket\">}</span>")
                .append("</summary>")
                .append("<ul class=\"json-tree-children\">");

        for (Map.Entry<?, ?> nestedEntry : mapValue.entrySet()) {
            appendTreeNode(html, String.valueOf(nestedEntry.getKey()), nestedEntry.getValue(), depth + 1);
        }
        html.append("</ul></details></li>");
    }

    private void appendArrayNode(StringBuilder html, String safeKey, List<?> listValue, int depth) {
        html.append("<li class=\"json-tree-item\">");
        if (listValue.isEmpty()) {
            html.append("<div class=\"json-tree-leaf\">")
                    .append("<span class=\"json-tree-key\">")
                    .append(safeKey)
                    .append("</span>")
                    .append("<span class=\"json-tree-colon\">:</span>")
                    .append("<span class=\"json-tree-bracket\">[]</span>")
                    .append("</div>")
                    .append("</li>");
            return;
        }

        html.append("<details class=\"json-tree-group\"");
        if (depth == 0) {
            html.append(" open");
        }
        html.append(">")
                .append("<summary class=\"json-tree-summary\">")
                .append("<span class=\"json-tree-key\">")
                .append(safeKey)
                .append("</span>")
                .append("<span class=\"json-tree-colon\">:</span>")
                .append("<span class=\"json-tree-bracket\">[</span>")
                .append("<span class=\"json-tree-meta\">")
                .append(listValue.size())
                .append(listValue.size() == 1 ? " item" : " items")
                .append("</span>")
                .append("<span class=\"json-tree-bracket\">]</span>")
                .append("</summary>")
                .append("<ul class=\"json-tree-children\">");

        for (int i = 0; i < listValue.size(); i++) {
            appendTreeNode(html, "[" + i + "]", listValue.get(i), depth + 1);
        }
        html.append("</ul></details></li>");
    }

    private void appendScalarNode(StringBuilder html, String safeKey, Object value) {
        html.append("<li class=\"json-tree-item\">")
                .append("<div class=\"json-tree-leaf\">")
                .append("<span class=\"json-tree-key\">")
                .append(safeKey)
                .append("</span>")
                .append("<span class=\"json-tree-colon\">:</span>");
        appendScalarValue(html, value);
        html.append("</div></li>");
    }

    private void appendScalarValue(StringBuilder html, Object value) {
        if (value == null) {
            html.append("<span class=\"json-tree-value json-tree-value--null\">null</span>");
            return;
        }
        if (value instanceof String textValue) {
            html.append("<span class=\"json-tree-value json-tree-value--string\">&quot;")
                    .append(HtmlUtils.htmlEscape(textValue))
                    .append("&quot;</span>");
            return;
        }
        if (value instanceof Number) {
            html.append("<span class=\"json-tree-value json-tree-value--number\">")
                    .append(HtmlUtils.htmlEscape(String.valueOf(value)))
                    .append("</span>");
            return;
        }
        if (value instanceof Boolean) {
            html.append("<span class=\"json-tree-value json-tree-value--boolean\">")
                    .append(HtmlUtils.htmlEscape(String.valueOf(value)))
                    .append("</span>");
            return;
        }
        html.append("<span class=\"json-tree-value json-tree-value--plain\">")
                .append(HtmlUtils.htmlEscape(String.valueOf(value)))
                .append("</span>");
    }

    private Mono<Map<String, Object>> parsePayload(String payloadJson) {
        return Mono.fromCallable(() -> {
            String raw = payloadJson == null ? "" : payloadJson.trim();
            if (raw.isEmpty()) {
                return objectMapper.readValue("{}", MAP_TYPE);
            }
            return objectMapper.readValue(raw, MAP_TYPE);
        });
    }

    private Mono<String> readUploadedJsonFile(FilePart filePart) {
        return DataBufferUtils.join(filePart.content())
                .map(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    return new String(bytes, StandardCharsets.UTF_8).trim();
                })
                .flatMap(content -> {
                    if (content.isEmpty()) {
                        return Mono.error(new IllegalArgumentException("Uploaded file is empty."));
                    }
                    return Mono.just(content);
                });
    }

    private String resolveServiceAccountJson(String rawRequestValue, WebSession session) {
        if (rawRequestValue != null && !rawRequestValue.trim().isEmpty()) {
            return rawRequestValue.trim();
        }

        Object fromSession = session.getAttributes().get(AUTH_SERVICE_ACCOUNT_SESSION_KEY);
        if (fromSession instanceof String text && !text.trim().isEmpty()) {
            return text.trim();
        }

        return "";
    }

    private String firstNonBlank(String... values) {
        if (values == null || values.length == 0) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return "";
    }

    private AuthBootstrap loadAuthBootstrapData(String serviceAccountJson) throws IOException {
        List<String> projects = gcpProjectService.listAvailableProjects(serviceAccountJson);
        if (projects.isEmpty()) {
            return new AuthBootstrap(projects, "", List.of(), null);
        }

        String selectedProjectId = projects.getFirst();
        try {
            List<String> databases = sanitizeDatabaseIds(
                    firestoreManagerService.listAvailableDatabases(selectedProjectId, serviceAccountJson));

            String databaseHint;
            if (databases.isEmpty()) {
                databaseHint = "No specific database IDs found for '" + selectedProjectId + "'. '(default)' remains selected.";
            } else {
                databaseHint = "Choose a database ID or keep '(default)'.";
            }
            return new AuthBootstrap(projects, selectedProjectId, databases, databaseHint);
        } catch (Exception ignored) {
            return new AuthBootstrap(
                    projects,
                    selectedProjectId,
                    List.of(),
                    "Could not load databases for '" + selectedProjectId + "'. '(default)' remains selected.");
        }
    }

    private List<String> sanitizeDatabaseIds(List<String> databaseIds) {
        List<String> sanitized = new ArrayList<>();
        if (databaseIds == null || databaseIds.isEmpty()) {
            return sanitized;
        }

        for (String databaseId : databaseIds) {
            String normalizedDatabaseId = normalize(databaseId);
            if (normalizedDatabaseId.isBlank()) {
                continue;
            }
            if ("(default)".equals(normalizedDatabaseId)) {
                continue;
            }
            if (sanitized.contains(normalizedDatabaseId)) {
                continue;
            }
            sanitized.add(normalizedDatabaseId);
        }

        return sanitized;
    }

    private Mono<String> status(Model model, String type, String message, String details) {
        model.addAttribute("type", type);
        model.addAttribute("message", message);
        model.addAttribute("details", details);
        return Mono.just("firestore/fragments :: status");
    }

    private String normalize(String input) {
        if (input == null) {
            return "";
        }
        String normalized = input.trim();
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized;
    }

    private boolean isCollectionPath(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }
        return path.split("/").length % 2 != 0;
    }

    private String prettyJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return String.valueOf(value);
        }
    }

    private record AuthBootstrap(List<String> projects, String selectedProjectId, List<String> databases,
                                 String databaseHint) {
    }
}
