package com.itbd.afirestore.controller;

import com.itbd.afirestore.FirestoreManagerService;
import com.itbd.afirestore.service.GenericFirestoreService;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/workbench")
public class FirestoreWorkbenchController {

    private final GenericFirestoreService genericFirestoreService;
    private final FirestoreManagerService firestoreManagerService;

    public FirestoreWorkbenchController(
            GenericFirestoreService genericFirestoreService,
            FirestoreManagerService firestoreManagerService) {
        this.genericFirestoreService = genericFirestoreService;
        this.firestoreManagerService = firestoreManagerService;
    }

    @GetMapping("/query")
    public Mono<ResponseEntity<Object>> query(
            @RequestParam("path") String path,
            @RequestParam(value = "whereField", required = false) List<String> whereFields,
            @RequestParam(value = "whereOperator", required = false) List<String> whereOperators,
            @RequestParam(value = "whereValue", required = false) List<String> whereValues,
            @RequestParam(value = "whereType", required = false) List<String> whereTypes,
            @RequestParam(value = "orderField", required = false) String orderField,
            @RequestParam(value = "orderDirection", defaultValue = "desc") String orderDirection,
            @RequestParam(value = "limit", defaultValue = "50") Integer limit,
            @RequestParam(value = "page", defaultValue = "0") Integer page) {
        String normalizedPath = normalize(path);
        if (normalizedPath.isBlank()) {
            return Mono.just(ResponseEntity.badRequest().body((Object) Map.of("message", "Path is required.")));
        }
        if (!isCollectionPath(normalizedPath)) {
            return Mono.just(ResponseEntity.badRequest().body((Object) Map.of("message", "Path must be a collection path.")));
        }

        int safeLimit = Math.max(1, Math.min(limit == null ? 50 : limit, 500));
        int safePage = Math.max(0, page == null ? 0 : page);
        String normalizedOrderField = normalize(orderField);
        String normalizedOrderDirection = "asc".equalsIgnoreCase(orderDirection) ? "asc" : "desc";

        List<GenericFirestoreService.WhereClause> whereClauses;
        try {
            whereClauses = buildWhereClauses(whereFields, whereOperators, whereValues, whereTypes);
        } catch (RuntimeException e) {
            return Mono.just(ResponseEntity.badRequest().body(Map.of("message", e.getMessage())));
        }

        return genericFirestoreService.queryCollection(
                        normalizedPath,
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

                    QueryResponse response = new QueryResponse(
                            normalizedPath,
                            result.documents(),
                            buildColumns(result.documents()),
                            result.documents().size(),
                            result.elapsedMs(),
                            result.pageIndex(),
                            result.pageSize(),
                            result.hasNextPage(),
                            result.pageIndex() > 0,
                            pageStart,
                            pageEnd
                    );
                    return ResponseEntity.ok((Object) response);
                })
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", e.getMessage() == null ? "Query failed." : e.getMessage()))));
    }

    @GetMapping("/nested")
    public Mono<ResponseEntity<Object>> nested(@RequestParam(value = "path", required = false) String path) {
        String normalizedPath = normalize(path);
        if (normalizedPath.isBlank()) {
            return Mono.just(ResponseEntity.ok((Object) new NestedResponse(
                    "",
                    "",
                    "empty",
                    List.of(),
                    List.of(),
                    "Run a collection query first, then traverse nested documents and subcollections here.",
                    ""
            )));
        }

        String parentPath = parentPath(normalizedPath);
        if (isCollectionPath(normalizedPath)) {
            return genericFirestoreService.getAllDocuments(normalizedPath)
                    .map(documents -> {
                        List<NodeItem> documentNodes = new ArrayList<>();
                        for (Map<String, Object> document : documents) {
                            String id = String.valueOf(document.getOrDefault("id", ""));
                            String docPath = String.valueOf(document.getOrDefault("_path", ""));
                            if (id.isBlank() || docPath.isBlank()) {
                                continue;
                            }
                            documentNodes.add(new NodeItem(id, docPath));
                        }
                        String hint = documentNodes.isEmpty()
                                ? "No documents found under this collection."
                                : "Select a document to inspect its child collections.";
                        return ResponseEntity.ok((Object) new NestedResponse(
                                normalizedPath,
                                parentPath,
                                "collection",
                                documentNodes,
                                List.of(),
                                hint,
                                ""
                        ));
                    })
                    .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                            "message", e.getMessage() == null ? "Failed to load nested node." : e.getMessage()))));
        }

        return genericFirestoreService.listSubcollections(normalizedPath)
                .map(subcollections -> {
                    List<NodeItem> childCollectionNodes = new ArrayList<>();
                    for (String collection : subcollections) {
                        String child = normalize(collection);
                        if (child.isBlank()) {
                            continue;
                        }
                        childCollectionNodes.add(new NodeItem(child, normalizedPath + "/" + child));
                    }
                    String hint = childCollectionNodes.isEmpty()
                            ? "No child collections found for this document."
                            : "Select a child collection to run a query and continue traversal.";
                    return ResponseEntity.ok((Object) new NestedResponse(
                            normalizedPath,
                            parentPath,
                            "document",
                            List.of(),
                            childCollectionNodes,
                            hint,
                            ""
                    ));
                })
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", e.getMessage() == null ? "Failed to load nested node." : e.getMessage()))));
    }

    @PostMapping(value = "/databases", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<Object>> databases(
            @RequestPart("projectId") String projectId,
            @RequestPart("file") FilePart filePart) {
        String normalizedProjectId = normalize(projectId);
        if (normalizedProjectId.isBlank()) {
            return Mono.just(ResponseEntity.badRequest().body((Object) Map.of("message", "projectId is required.")));
        }

        return readUploadedJsonFile(filePart)
                .flatMap(serviceAccountJson -> Mono.fromCallable(
                                () -> firestoreManagerService.listAvailableDatabases(normalizedProjectId, serviceAccountJson))
                        .map(this::sanitizeDatabaseIds)
                        .map(value -> ResponseEntity.ok((Object) value)))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", e.getMessage() == null ? "Failed to load databases." : e.getMessage()))));
    }

    @PostMapping("/replace")
    public Mono<ResponseEntity<Object>> replace(@RequestBody ReplaceRequest request) {
        String normalizedDocumentPath = normalize(request.documentPath());
        if (normalizedDocumentPath.isBlank()) {
            return Mono.just(ResponseEntity.badRequest().body((Object) Map.of("message", "documentPath is required.")));
        }
        Map<String, Object> payload = request.payload() == null ? Map.of() : request.payload();
        return genericFirestoreService.replaceDocument(normalizedDocumentPath, payload)
                .map(value -> ResponseEntity.ok((Object) value))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", e.getMessage() == null ? "Replace failed." : e.getMessage()))));
    }

    private List<Map<String, String>> buildColumns(List<Map<String, Object>> documents) {
        LinkedHashSet<String> orderedNames = new LinkedHashSet<>();
        orderedNames.add("id");
        if (documents != null) {
            for (Map<String, Object> document : documents) {
                if (document == null) {
                    continue;
                }
                for (String key : document.keySet()) {
                    if (key == null || key.isBlank() || key.startsWith("_") || "id".equals(key)) {
                        continue;
                    }
                    orderedNames.add(key);
                }
            }
        }

        List<Map<String, String>> columns = new ArrayList<>();
        for (String columnName : orderedNames) {
            String type = inferColumnType(columnName, documents);
            columns.add(Map.of("name", columnName, "type", type));
        }
        return columns;
    }

    private String inferColumnType(String columnName, List<Map<String, Object>> documents) {
        if ("id".equals(columnName)) {
            return "string";
        }
        if (documents == null) {
            return "unknown";
        }

        for (Map<String, Object> document : documents) {
            if (document == null || !document.containsKey(columnName)) {
                continue;
            }
            Object value = document.get(columnName);
            if (value == null) {
                continue;
            }
            if (value instanceof String) {
                return "string";
            }
            if (value instanceof Number) {
                return "number";
            }
            if (value instanceof Boolean) {
                return "boolean";
            }
            if (value instanceof List<?>) {
                return "array";
            }
            if (value instanceof Map<?, ?>) {
                return "object";
            }
            return value.getClass().getSimpleName().toLowerCase(Locale.ROOT);
        }
        return "unknown";
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

        for (int i = 0; i < maxSize; i += 1) {
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
            Object typedValue = parseWhereValue(rawValue, type);
            clauses.add(new GenericFirestoreService.WhereClause(field, operator, typedValue));
        }
        return clauses;
    }

    private Object parseWhereValue(String rawValue, String type) {
        String raw = rawValue == null ? "" : rawValue.trim();
        if (raw.isEmpty()) {
            throw new IllegalArgumentException("Where value cannot be empty.");
        }

        return switch (type) {
            case "string" -> raw;
            case "number" -> parseNumber(raw);
            case "boolean" -> Boolean.parseBoolean(raw);
            case "null" -> null;
            default -> throw new IllegalArgumentException("Unsupported where type: " + type);
        };
    }

    private Number parseNumber(String raw) {
        if (raw.contains(".")) {
            return Double.parseDouble(raw);
        }
        return Long.parseLong(raw);
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

    private List<String> sanitizeDatabaseIds(List<String> databaseIds) {
        List<String> sanitized = new ArrayList<>();
        if (databaseIds == null) {
            return sanitized;
        }
        for (String databaseId : databaseIds) {
            String normalized = normalize(databaseId);
            if (normalized.isBlank() || "(default)".equals(normalized) || sanitized.contains(normalized)) {
                continue;
            }
            sanitized.add(normalized);
        }
        return sanitized;
    }

    private record QueryResponse(
            String path,
            List<Map<String, Object>> documents,
            List<Map<String, String>> columns,
            int resultCount,
            long elapsedMs,
            int pageIndex,
            int pageSize,
            boolean hasNextPage,
            boolean hasPreviousPage,
            int pageStart,
            int pageEnd) {
    }

    private record NodeItem(String id, String path) {
    }

    private record NestedResponse(
            String currentPath,
            String parentPath,
            String nodeType,
            List<NodeItem> documentNodes,
            List<NodeItem> childCollectionNodes,
            String nestedHint,
            String nestedError) {
    }

    private record ReplaceRequest(String documentPath, Map<String, Object> payload) {
    }
}
