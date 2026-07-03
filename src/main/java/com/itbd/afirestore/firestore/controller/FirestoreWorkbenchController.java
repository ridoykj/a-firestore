package com.itbd.afirestore.firestore.controller;

import com.google.cloud.Timestamp;
import com.itbd.afirestore.firestore.dto.DocumentDto;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import com.itbd.afirestore.firestore.service.GenericFirestoreService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/workbench")
public class FirestoreWorkbenchController {
    private static final Logger LOGGER = LoggerFactory.getLogger(FirestoreWorkbenchController.class);

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
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
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

        String normalizedDatabaseId = normalizeDatabaseId(databaseId);
        int safeLimit = Math.clamp(limit == null ? 50 : limit, 1, 500);
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
                        projectId,
                        normalizedDatabaseId,
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
                .onErrorResume(e -> {
                    String errorMessage = resolveErrorMessage(e);
                    LOGGER.error("Workbench query failed for path='{}': {}", normalizedPath, errorMessage, e);
                    return Mono.just(ResponseEntity.internalServerError().body(Map.of(
                            "message", errorMessage)));
                });
    }

    @GetMapping("/nested")
    public Mono<ResponseEntity<Object>> nested(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "limit", defaultValue = "25") Integer limit,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "idFilter", required = false) String idFilter) {
        String normalizedPath = normalize(path);
        String normalizedDatabaseId = normalizeDatabaseId(databaseId);
        int safeLimit = Math.clamp(limit == null ? 25 : limit, 1, 100);
        String normalizedCursor = normalize(cursor);
        String normalizedIdFilter = normalize(idFilter);
        String cursorValue = normalizedCursor.isBlank() ? null : normalizedCursor;
        if (cursorValue != null && cursorValue.contains("/")) {
            return Mono.just(ResponseEntity.badRequest().body((Object) Map.of(
                    "message", "cursor must be an item ID, not a full path.")));
        }

        if (normalizedPath.isBlank()) {
            return Mono.just(ResponseEntity.ok((Object) new NestedResponse(
                    "",
                    "",
                    "empty",
                    List.of(),
                    List.of(),
                    "Run a collection query first, then traverse nested documents and subcollections here.",
                    "",
                    new PageInfo(null, false, 0, safeLimit)
            )));
        }

        String parentPath = parentPath(normalizedPath);
        if (isCollectionPath(normalizedPath)) {
            long startNanos = System.nanoTime();
            return genericFirestoreService.listDocumentNodesPage(
                            projectId,
                            normalizedDatabaseId,
                            normalizedPath,
                            safeLimit,
                            cursorValue,
                            normalizedIdFilter)
                    .map(page -> {
                        List<NodeItem> documentNodes = page.nodes().stream()
                                .map(node -> new NodeItem(node.id(), node.path()))
                                .toList();

                        String hint = documentNodes.isEmpty()
                                ? (normalizedIdFilter.isBlank()
                                   ? "No documents found under this collection."
                                   : "No matching document IDs found in this collection.")
                                : "Scroll to load more.";

                        long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
                        LOGGER.info(
                                "Nested collection page loaded path='{}' limit={} returnedCount={} hasMore={} elapsedMs={}",
                                normalizedPath,
                                safeLimit,
                                documentNodes.size(),
                                page.hasMore(),
                                elapsedMs);

                        return ResponseEntity.ok((Object) new NestedResponse(
                                normalizedPath,
                                parentPath,
                                "collection",
                                documentNodes,
                                List.of(),
                                hint,
                                "",
                                new PageInfo(
                                        page.nextCursor(),
                                        page.hasMore(),
                                        documentNodes.size(),
                                        page.limit())
                        ));
                    })
                    .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                            "message", resolveNestedErrorMessage(e)))));
        }

        long startNanos = System.nanoTime();
        return genericFirestoreService.listSubcollectionNodesPage(
                        projectId,
                        normalizedDatabaseId,
                        normalizedPath,
                        safeLimit,
                        cursorValue,
                        normalizedIdFilter)
                .map(page -> {
                    List<NodeItem> childCollectionNodes = page.nodes().stream()
                            .map(node -> new NodeItem(node.id(), node.path()))
                            .toList();
                    String hint = childCollectionNodes.isEmpty()
                            ? (normalizedIdFilter.isBlank()
                               ? "No child collections found for this document."
                               : "No matching child collection IDs found for this document.")
                            : "Select a child collection to run a query and continue traversal.";

                    long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
                    LOGGER.info(
                            "Nested document collections loaded path='{}' returnedCount={} elapsedMs={}",
                            normalizedPath,
                            childCollectionNodes.size(),
                            elapsedMs);

                    return ResponseEntity.ok((Object) new NestedResponse(
                            normalizedPath,
                            parentPath,
                            "document",
                            List.of(),
                            childCollectionNodes,
                            hint,
                            "",
                            new PageInfo(
                                    page.nextCursor(),
                                    page.hasMore(),
                                    childCollectionNodes.size(),
                                    page.limit())
                    ));
                })
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", resolveNestedErrorMessage(e)))));
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
    public Mono<ResponseEntity<Object>> replace(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody ReplaceRequest request) {
        String normalizedDocumentPath = normalize(request.documentPath());
        if (normalizedDocumentPath.isBlank()) {
            return Mono.just(ResponseEntity.badRequest().body((Object) Map.of("message", "documentPath is required.")));
        }
        Map<String, Object> payload = request.payload() == null ? Map.of() : request.payload();
        return genericFirestoreService.replaceDocument(projectId, normalizeDatabaseId(databaseId), normalizedDocumentPath, payload)
                .map(value -> ResponseEntity.ok((Object) value))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", e.getMessage() == null ? "Replace failed." : e.getMessage()))));
    }

    private List<Map<String, String>> buildColumns(List<DocumentDto> documents) {
        LinkedHashSet<String> orderedNames = new LinkedHashSet<>();
        orderedNames.add("id");
        if (documents != null) {
            for (DocumentDto document : documents) {
                if (document == null) {
                    continue;
                }
                Map<String, FirestoreValue> fields = document.fields();
                if (fields != null) {
                    for (String key : fields.keySet()) {
                        if (key == null || key.isBlank() || key.startsWith("_") || "id".equals(key)) {
                            continue;
                        }
                        orderedNames.add(key);
                    }
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

    private String inferColumnType(String columnName, List<DocumentDto> documents) {
        if ("id".equals(columnName)) {
            return "string";
        }
        if (documents == null) {
            return "unknown";
        }

        for (DocumentDto document : documents) {
            if (document == null) {
                continue;
            }
            FirestoreValue value = document.fields().get(columnName);
            if (value == null || value instanceof FirestoreValue.NullValue) {
                continue;
            }

            Object rawValue = value.toFirestoreObject();
            switch (rawValue) {
                case null -> {
                    continue;
                }
                case String s -> {
                    return "string";
                }
                case Number number -> {
                    return "number";
                }
                case Boolean b -> {
                    return "boolean";
                }
                case List<?> objects -> {
                    return "array";
                }
                case Map<?, ?> map -> {
                    return "object";
                }
                default -> {
                }
            }
            return rawValue.getClass().getSimpleName().toLowerCase(Locale.ROOT);
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
            if ("id".equalsIgnoreCase(field)) {
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
            case "string-array" -> Arrays.stream(raw.split(","))
                    .map(String::trim)
                    .toList();
            case "number-array" -> Arrays.stream(raw.split(","))
                    .map(String::trim)
                    .map(this::parseNumber)
                    .toList();
            case "timestamp" -> {
                Instant instant = Instant.parse(raw);
                yield Timestamp.ofTimeSecondsAndNanos(instant.getEpochSecond(), instant.getNano());
            }
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

    private String normalizeDatabaseId(String databaseId) {
        if (databaseId == null || databaseId.trim().isEmpty()) {
            return "(default)";
        }
        return databaseId.trim();
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

    private String resolveNestedErrorMessage(Throwable error) {
        if (error == null) {
            return "Failed to load nested node.";
        }

        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && message.toLowerCase(Locale.ROOT).contains("query timed out")) {
                return "Nested traversal query timed out. Please narrow your scope or continue with smaller pages.";
            }
            current = current.getCause();
        }

        return error.getMessage() == null ? "Failed to load nested node." : error.getMessage();
    }

    private String resolveErrorMessage(Throwable error) {
        if (error == null) {
            return "An unknown error occurred.";
        }

        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && !message.isBlank()) {
                // Unwrap ExecutionException/CompletionException to show the real Firestore error
                return message;
            }
            current = current.getCause();
        }

        return "Query failed.";
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
            List<DocumentDto> documents,
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
            String nestedError,
            PageInfo pageInfo) {
    }

    private record PageInfo(
            String nextCursor,
            boolean hasMore,
            int returnedCount,
            int limit) {
    }

    private record ReplaceRequest(String documentPath, Map<String, Object> payload) {
    }
}
