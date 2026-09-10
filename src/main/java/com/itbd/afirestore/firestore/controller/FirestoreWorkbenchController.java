package com.itbd.afirestore.firestore.controller;

import com.google.cloud.Timestamp;
import com.itbd.afirestore.common.exception.OperationFailedException;
import com.itbd.afirestore.firestore.dto.DocumentDto;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import com.itbd.afirestore.firestore.service.GenericFirestoreService;
import com.itbd.afirestore.firestore.support.FirestoreIds;
import com.itbd.afirestore.firestore.support.FirestorePaths;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@Slf4j
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

    /**
     * FFP-105/FFP-203: Cursor-paginated query. {@code cursor} is the opaque token returned as
     * {@code nextCursor} by a previous page; omit it for the first page.
     *
     * <p>FFP-203 extends the contract: {@code whereGroup} assigns each where clause to an OR
     * group (clauses within a group AND together; groups combine with {@code filterCombinator}),
     * {@code orderField}/{@code orderDirection} may repeat for multiple order clauses, and
     * {@code collectionGroup=true} runs a collection-group query where {@code path} is the
     * collection id.</p>
     */
    @GetMapping("/query")
    public Mono<Object> query(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam("path") String path,
            @RequestParam(value = "whereField", required = false) List<String> whereFields,
            @RequestParam(value = "whereOperator", required = false) List<String> whereOperators,
            @RequestParam(value = "whereValue", required = false) List<String> whereValues,
            @RequestParam(value = "whereType", required = false) List<String> whereTypes,
            @RequestParam(value = "whereGroup", required = false) List<String> whereGroups,
            @RequestParam(value = "filterCombinator", defaultValue = "and") String filterCombinator,
            @RequestParam(value = "orderField", required = false) List<String> orderFields,
            @RequestParam(value = "orderDirection", required = false) List<String> orderDirections,
            @RequestParam(value = "collectionGroup", defaultValue = "false") boolean collectionGroup,
            @RequestParam(value = "limit", defaultValue = "50") Integer limit,
            @RequestParam(value = "cursor", required = false) String cursor) {
        String normalizedPath = FirestorePaths.normalize(path);
        if (normalizedPath.isBlank()) {
            throw new IllegalArgumentException("Path is required.");
        }
        if (collectionGroup) {
            if (normalizedPath.contains("/")) {
                throw new IllegalArgumentException(
                        "Collection-group id must be a single collection name without '/'.");
            }
        } else if (!FirestorePaths.isCollection(normalizedPath)) {
            throw new IllegalArgumentException("Path must be a collection path.");
        }

        String normalizedDatabaseId = FirestoreIds.normalizeDatabaseId(databaseId);
        int safeLimit = Math.clamp(limit == null ? 50 : limit, 1, 500);
        String normalizedCombinator = "or".equalsIgnoreCase(filterCombinator) ? "or" : "and";
        String normalizedCursor = cursor == null || cursor.isBlank() ? null : cursor.trim();

        // Clause parsing throws IllegalArgumentException on bad input; the advice renders the 400.
        List<GenericFirestoreService.WhereClause> whereClauses =
                buildWhereClauses(whereFields, whereOperators, whereValues, whereTypes, whereGroups);
        List<GenericFirestoreService.OrderClause> orderClauses =
                buildOrderClauses(orderFields, orderDirections);
        validateQuery(whereClauses);

        return genericFirestoreService.queryCollection(
                        projectId,
                        normalizedDatabaseId,
                        normalizedPath,
                        whereClauses,
                        normalizedCombinator,
                        orderClauses,
                        collectionGroup,
                        safeLimit,
                        normalizedCursor)
                .map(result -> (Object) new QueryResponse(
                        normalizedPath,
                        result.documents(),
                        buildColumns(result.documents()),
                        result.documents().size(),
                        result.elapsedMs(),
                        result.pageSize(),
                        result.hasMore(),
                        result.nextCursor()));
    }

    /**
     * FFP-106: Atomic bulk delete of at most
     * {@value GenericFirestoreService#MAX_BULK_DELETE_PATHS} unique, validated document paths.
     */
    @PostMapping("/bulk-delete")
    public Mono<Object> bulkDelete(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody BulkDeleteRequest request) {
        List<String> paths = request == null ? List.of() : request.paths();
        return genericFirestoreService
                .batchDeleteDocuments(projectId, FirestoreIds.normalizeDatabaseId(databaseId), paths)
                .map(result -> {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("deletedCount", result.deletedPaths().size());
                    body.put("failedCount", result.failedPaths().size());
                    body.put("deletedPaths", result.deletedPaths());
                    body.put("failedPaths", result.failedPaths());
                    body.put("complete", result.isCompleteSuccess());
                    return (Object) body;
                });
    }

    /**
     * FFP-302: Returns a bounded sample of a collection's documents (typed) for schema profiling.
     */
    @GetMapping("/sample")
    public Mono<Object> sample(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam("path") String path,
            @RequestParam(value = "limit", defaultValue = "200") Integer limit) {
        String normalizedPath = FirestorePaths.normalize(path);
        if (!FirestorePaths.isCollection(normalizedPath)) {
            throw new IllegalArgumentException("Path must be a collection path.");
        }
        int safeLimit = Math.clamp(limit == null ? 200 : limit, 1, 1000);
        return genericFirestoreService
                .sampleCollection(projectId, FirestoreIds.normalizeDatabaseId(databaseId), normalizedPath, safeLimit)
                .map(documents -> {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("path", normalizedPath);
                    body.put("sampled", documents.size());
                    body.put("documents", documents);
                    return (Object) body;
                });
    }

    /**
     * FFP-304: Streams a typed backup artifact for a document or collection subtree. The artifact
     * carries a {@code formatVersion} and a manifest and preserves native Firestore value types.
     */
    @GetMapping("/backup")
    public Mono<Object> backup(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam("path") String path,
            @RequestParam(value = "limit", defaultValue = "5000") Integer limit) {
        String normalizedPath = FirestorePaths.normalize(path);
        if (normalizedPath.isBlank()) {
            throw new IllegalArgumentException("Path is required.");
        }
        int safeLimit = Math.clamp(limit == null ? 5000 : limit, 1, 50000);
        boolean isCollection = FirestorePaths.isCollection(normalizedPath);
        return genericFirestoreService
                .backupSubtree(projectId, FirestoreIds.normalizeDatabaseId(databaseId), normalizedPath, safeLimit)
                .map(documents -> {
                    Map<String, Object> manifest = new LinkedHashMap<>();
                    manifest.put("path", normalizedPath);
                    manifest.put("kind", isCollection ? "collection" : "document");
                    manifest.put("exportedAt", Instant.now().toString());
                    manifest.put("documentCount", documents.size());

                    Map<String, Object> artifact = new LinkedHashMap<>();
                    artifact.put("formatVersion", 1);
                    artifact.put("manifest", manifest);
                    artifact.put("documents", documents);
                    return (Object) artifact;
                });
    }

    /**
     * FFP-303: Previewable bulk edit. A dry run reports the plan; execution applies a typed merge
     * patch across the selected documents in a bounded batch and reports per-document outcomes.
     */
    @PostMapping("/bulk-edit")
    public Mono<Object> bulkEdit(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody BulkEditRequest request) {
        List<String> paths = request == null ? List.of() : request.paths();
        Map<String, FirestoreValue> setFields = request == null || request.setFields() == null
                ? Map.of()
                : request.setFields();
        List<String> deleteFieldPaths = request == null || request.deleteFieldPaths() == null
                ? List.of()
                : request.deleteFieldPaths();
        boolean dryRun = request != null && request.dryRun();

        return genericFirestoreService.bulkEditDocuments(
                        projectId,
                        FirestoreIds.normalizeDatabaseId(databaseId),
                        paths,
                        setFields,
                        deleteFieldPaths,
                        dryRun)
                .map(result -> {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("dryRun", result.dryRun());
                    body.put("requested", result.requested());
                    body.put("succeeded", result.succeeded());
                    body.put("failed", result.failed());
                    body.put("results", result.results().stream()
                            .map(item -> Map.of(
                                    "path", item.path(),
                                    "status", item.status(),
                                    "message", item.message() == null ? "" : item.message()))
                            .toList());
                    body.put("complete", result.complete());
                    return (Object) body;
                });
    }

    @GetMapping("/nested")
    public Mono<Object> nested(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "limit", defaultValue = "25") Integer limit,
            @RequestParam(value = "cursor", required = false) String cursor,
            @RequestParam(value = "idFilter", required = false) String idFilter) {
        String normalizedPath = FirestorePaths.normalize(path);
        String normalizedDatabaseId = FirestoreIds.normalizeDatabaseId(databaseId);
        int safeLimit = Math.clamp(limit == null ? 25 : limit, 1, 100);
        String normalizedIdFilter = trimmed(idFilter);
        String cursorValue = trimmed(cursor).isBlank() ? null : trimmed(cursor);
        if (cursorValue != null && cursorValue.contains("/")) {
            throw new IllegalArgumentException("cursor must be an item ID, not a full path.");
        }

        if (normalizedPath.isBlank()) {
            return Mono.just((Object) new NestedResponse(
                    "",
                    "",
                    "empty",
                    List.of(),
                    List.of(),
                    "Run a collection query first, then traverse nested documents and subcollections here.",
                    "",
                    new PageInfo(null, false, 0, safeLimit)
            ));
        }

        String parentPath = FirestorePaths.parent(normalizedPath);
        if (FirestorePaths.isCollection(normalizedPath)) {
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
                        log.info(
                                "Nested collection page loaded path='{}' limit={} returnedCount={} hasMore={} elapsedMs={}",
                                normalizedPath,
                                safeLimit,
                                documentNodes.size(),
                                page.hasMore(),
                                elapsedMs);

                        return (Object) new NestedResponse(
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
                        );
                    })
                    .onErrorMap(FirestoreWorkbenchController::describeTraversalTimeout);
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
                    log.info(
                            "Nested document collections loaded path='{}' returnedCount={} elapsedMs={}",
                            normalizedPath,
                            childCollectionNodes.size(),
                            elapsedMs);

                    return (Object) new NestedResponse(
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
                    );
                })
                .onErrorMap(FirestoreWorkbenchController::describeTraversalTimeout);
    }

    @PostMapping(value = "/databases", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<List<String>> databases(
            @RequestPart("projectId") String projectId,
            @RequestPart("file") FilePart filePart) {
        String normalizedProjectId = FirestoreIds.requireProjectId(projectId);

        return readUploadedJsonFile(filePart)
                .flatMap(serviceAccountJson -> Mono.fromCallable(
                        () -> firestoreManagerService.listAvailableDatabases(normalizedProjectId, serviceAccountJson)))
                .map(this::sanitizeDatabaseIds);
    }

    @PostMapping("/replace")
    public Mono<Map<String, Object>> replace(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody ReplaceRequest request) {
        String normalizedDocumentPath = FirestorePaths.normalize(request.documentPath());
        if (normalizedDocumentPath.isBlank()) {
            throw new IllegalArgumentException("documentPath is required.");
        }
        Map<String, Object> payload = request.payload() == null ? Map.of() : request.payload();
        return genericFirestoreService.replaceDocument(
                projectId, FirestoreIds.normalizeDatabaseId(databaseId), normalizedDocumentPath, payload);
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

            return switch (value) {
                case FirestoreValue.StringValue v -> "string";
                case FirestoreValue.IntegerValue v -> "number";
                case FirestoreValue.DoubleValue v -> "number";
                case FirestoreValue.BooleanValue v -> "boolean";
                case FirestoreValue.TimestampValue v -> "timestamp";
                case FirestoreValue.GeoPointValue v -> "geopoint";
                case FirestoreValue.ReferenceValue v -> "reference";
                case FirestoreValue.BytesValue v -> "bytes";
                case FirestoreValue.ArrayValue v -> "array";
                case FirestoreValue.MapValue v -> "object";
                case FirestoreValue.NullValue v -> "unknown";
            };
        }
        return "unknown";
    }

    private List<GenericFirestoreService.WhereClause> buildWhereClauses(
            List<String> whereFields,
            List<String> whereOperators,
            List<String> whereValues,
            List<String> whereTypes,
            List<String> whereGroups) {
        List<GenericFirestoreService.WhereClause> clauses = new ArrayList<>();
        int maxSize = Math.max(
                Math.max(sizeOf(whereFields), sizeOf(whereOperators)),
                Math.max(sizeOf(whereValues), sizeOf(whereTypes)));

        for (int i = 0; i < maxSize; i += 1) {
            String field = trimmed(valueAt(whereFields, i));
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
            int groupId = parseGroupId(valueAt(whereGroups, i));
            clauses.add(new GenericFirestoreService.WhereClause(field, operator, typedValue, groupId));
        }
        return clauses;
    }

    private int parseGroupId(String rawGroup) {
        if (rawGroup == null || rawGroup.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(rawGroup.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Filter group must be an integer: " + rawGroup);
        }
    }

    private List<GenericFirestoreService.OrderClause> buildOrderClauses(
            List<String> orderFields,
            List<String> orderDirections) {
        List<GenericFirestoreService.OrderClause> clauses = new ArrayList<>();
        int size = sizeOf(orderFields);
        for (int i = 0; i < size; i += 1) {
            String field = trimmed(valueAt(orderFields, i));
            if (field.isBlank()) {
                continue;
            }
            String direction = valueAt(orderDirections, i);
            String normalizedDirection = "asc".equalsIgnoreCase(direction) ? "asc" : "desc";
            clauses.add(new GenericFirestoreService.OrderClause(field, normalizedDirection));
        }
        return clauses;
    }

    /**
     * FFP-203: reject clause combinations Firestore cannot serve, with an actionable message,
     * before issuing the query.
     */
    private void validateQuery(List<GenericFirestoreService.WhereClause> whereClauses) {
        if (whereClauses.size() > 30) {
            throw new IllegalArgumentException("A query supports at most 30 filter clauses.");
        }
        long groupCount = whereClauses.stream().map(GenericFirestoreService.WhereClause::groupId).distinct().count();
        if (groupCount > 10) {
            throw new IllegalArgumentException("A query supports at most 10 OR groups.");
        }
        long arrayContains = whereClauses.stream()
                .filter(c -> "array-contains".equals(c.operator())).count();
        if (arrayContains > 1) {
            throw new IllegalArgumentException("Only one 'array-contains' filter is allowed per query.");
        }
        long arrayContainsAny = whereClauses.stream()
                .filter(c -> "array-contains-any".equals(c.operator())).count();
        if (arrayContainsAny > 1) {
            throw new IllegalArgumentException("Only one 'array-contains-any' filter is allowed per query.");
        }
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

    /**
     * Trims a non-path parameter (cursor, id filter, field name). Paths go through
     * {@link FirestorePaths#normalize(String)} instead — a cursor or field name must keep any
     * interior characters it has.
     */
    private static String trimmed(String input) {
        return input == null ? "" : input.trim();
    }

    /**
     * The one error translation this controller still owns: a traversal timeout gets an actionable
     * message instead of the SDK's. Everything else is translated once by the service and rendered
     * once by {@code RestExceptionHandler} (DUP-007).
     */
    private static Throwable describeTraversalTimeout(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && message.toLowerCase(Locale.ROOT).contains("query timed out")) {
                return new OperationFailedException(
                        "Nested traversal query timed out. Please narrow your scope or continue with smaller pages.",
                        error);
            }
            current = current.getCause();
        }
        return error;
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
            String normalized = trimmed(databaseId);
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
            int pageSize,
            boolean hasNextPage,
            String nextCursor) {
    }

    /** FFP-106: Bulk delete request body. */
    record BulkDeleteRequest(List<String> paths) {
        BulkDeleteRequest {
            if (paths == null) paths = List.of();
        }
    }

    /** FFP-303: Bulk edit request body. {@code setFields} are canonical typed values. */
    record BulkEditRequest(
            List<String> paths,
            Map<String, FirestoreValue> setFields,
            List<String> deleteFieldPaths,
            boolean dryRun) {
        BulkEditRequest {
            if (paths == null) paths = List.of();
        }
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
