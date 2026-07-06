package com.itbd.afirestore.firestore.service;

import com.google.api.core.ApiFuture;
import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldPath;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.firestore.Precondition;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.SetOptions;
import com.google.cloud.firestore.WriteBatch;
import com.google.cloud.firestore.WriteResult;
import com.google.cloud.firestore.v1.FirestoreAdminClient;
import com.google.cloud.firestore.v1.FirestoreAdminSettings;
import com.google.firestore.admin.v1.Database;
import com.itbd.afirestore.common.exception.NotFoundException;
import com.itbd.afirestore.firestore.dto.DocumentDto;
import com.itbd.afirestore.firestore.dto.DocumentWriteRequest;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Slf4j
@Service
@RequiredArgsConstructor
public class GenericFirestoreService {

    /** FFP-106: A bulk delete request is a single atomic batch of at most this many paths. */
    public static final int MAX_BULK_DELETE_PATHS = 500;

    public record PaginatedDocuments(
            List<DocumentDto> documents,
            int pageIndex,
            int pageSize,
            boolean hasNextPage) {
    }

    public record WhereClause(String field, String operator, Object value) {}

    /**
     * FFP-105: Result of a cursor-paginated query. {@code nextCursor} is opaque; pass it back
     * verbatim to fetch the next page.
     */
    public record CursorQueryResult(
            List<DocumentDto> documents,
            long elapsedMs,
            int pageSize,
            boolean hasMore,
            String nextCursor
    ) {
        public CursorQueryResult {
            if (documents == null) documents = List.of();
        }
    }

    public record NestedNode(String id, String path) {}

    public record NodePage(
            List<NestedNode> nodes,
            String nextCursor,
            boolean hasMore,
            int limit) {
    }

    /**
     * FFP-106: Result of an atomic bulk delete. Because the batch commits atomically, either
     * every requested path was deleted or none were.
     */
    public record BulkDeleteResult(
            List<String> deletedPaths,
            List<String> failedPaths
    ) {
        public BulkDeleteResult {
            if (deletedPaths == null) deletedPaths = List.of();
            if (failedPaths == null) failedPaths = List.of();
        }

        public boolean isCompleteSuccess() {
            return failedPaths.isEmpty();
        }

        public int totalProcessed() {
            return deletedPaths.size() + failedPaths.size();
        }
    }

    /**
     * FFP-104: Thrown when a write or delete misses its {@code expectedUpdateTime} precondition.
     * Carries the latest document (when it still exists) so callers can render a conflict diff.
     */
    public static class OptimisticConcurrencyException extends RuntimeException {
        private final transient DocumentDto latestDocument;

        public OptimisticConcurrencyException(String message, DocumentDto latestDocument) {
            super(message);
            this.latestDocument = latestDocument;
        }

        public DocumentDto getLatestDocument() {
            return latestDocument;
        }
    }

    private final FirestoreManagerService firestoreManagerService;

    /**
     * FFP-105: Cursor-paginated collection query. Ordering always ends with the document ID so
     * pages are stable even when the ordered field has duplicate values; the cursor is applied
     * with {@code startAfter} so no documents are skipped or repeated.
     */
    public Mono<CursorQueryResult> queryCollection(
            String projectId,
            String databaseId,
            String path,
            List<WhereClause> whereClauses,
            String orderField,
            String orderDirection,
            int limit,
            String cursorToken) {
        return Mono.fromCallable(() -> {
            long startNanos = System.nanoTime();
            int safeLimit = Math.clamp(limit, 1, 500);

            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            Query query = firestore.collection(path);

            if (whereClauses != null) {
                for (WhereClause clause : whereClauses) {
                    if (clause == null || clause.field() == null || clause.field().isBlank()
                            || clause.operator() == null || clause.operator().isBlank()) {
                        continue;
                    }
                    query = applyWhere(query, clause.field(), clause.operator(), clause.value());
                }
            }

            Query.Direction direction = "asc".equalsIgnoreCase(orderDirection)
                    ? Query.Direction.ASCENDING
                    : Query.Direction.DESCENDING;
            String normalizedOrderField = orderField == null ? "" : orderField.trim();
            boolean orderByField = !normalizedOrderField.isBlank()
                    && !"id".equalsIgnoreCase(normalizedOrderField);

            if (orderByField) {
                query = query.orderBy(normalizedOrderField, direction)
                        .orderBy(FieldPath.documentId(), direction);
            } else {
                // Firestore's built-in index on __name__ is ascending-only; a descending
                // document-ID sort requires a manually created index. Always order ascending
                // when no order field is chosen so plain browse queries never demand one.
                query = query.orderBy(FieldPath.documentId(), Query.Direction.ASCENDING);
            }

            if (cursorToken != null && !cursorToken.isBlank()) {
                QueryCursorCodec.DecodedCursor cursor = QueryCursorCodec.decode(cursorToken);
                if (orderByField) {
                    Object orderValue = cursor.orderValue() == null
                            ? null
                            : cursor.orderValue().toFirestoreObject(firestore);
                    query = query.startAfter(orderValue, cursor.documentId());
                } else {
                    query = query.startAfter(cursor.documentId());
                }
            }

            query = query.limit(safeLimit + 1);

            List<QueryDocumentSnapshot> fetched = query.get().get().getDocuments();
            boolean hasMore = fetched.size() > safeLimit;
            List<QueryDocumentSnapshot> pageDocs = fetched.stream().limit(safeLimit).toList();

            List<DocumentDto> documents = pageDocs.stream()
                    .map(this::toDocumentDto)
                    .collect(Collectors.toList());

            String nextCursor = null;
            if (hasMore && !pageDocs.isEmpty()) {
                QueryDocumentSnapshot lastDoc = pageDocs.get(pageDocs.size() - 1);
                FirestoreValue orderValue = orderByField
                        ? FirestoreValue.from(lastDoc.get(normalizedOrderField))
                        : null;
                nextCursor = QueryCursorCodec.encode(orderValue, lastDoc.getId());
            }

            long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
            return new CursorQueryResult(documents, elapsedMs, safeLimit, hasMore, nextCursor);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-101: Reads a single document as a typed DTO including its update time and
     * direct subcollection names.
     */
    public Mono<DocumentDto> getDocumentDetails(String projectId, String databaseId, String documentPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            return readDocumentDetails(firestore, documentPath);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-102/FFP-103/FFP-104: Applies a {@link DocumentWriteRequest} inside a transaction so the
     * {@code expectedUpdateTime} precondition, the merge/replace write, and explicit field
     * deletions are atomic. Returns the resulting document.
     */
    public Mono<DocumentDto> writeDocument(
            String projectId,
            String databaseId,
            String documentPath,
            DocumentWriteRequest request) {
        return Mono.fromCallable(() -> {
            String normalizedPath = normalizeDocumentPath(documentPath);
            DocumentWriteRequest write = request == null
                    ? new DocumentWriteRequest(null, null, null, null)
                    : request;
            List<String> deleteFieldPaths = validateDeleteFieldPaths(write);

            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(normalizedPath);

            Map<String, Object> rawFields = new LinkedHashMap<>();
            write.fields().forEach((key, value) ->
                    rawFields.put(key, value == null ? null : value.toFirestoreObject(firestore)));
            Map<String, Object> payload = write.mode() == DocumentWriteRequest.WriteMode.MERGE
                    ? withDeleteSentinels(rawFields, deleteFieldPaths)
                    : rawFields;

            try {
                firestore.runTransaction(transaction -> {
                    DocumentSnapshot snapshot = transaction.get(docRef).get();
                    enforceUpdateTimePrecondition(snapshot, write.expectedUpdateTime(), normalizedPath);
                    if (write.mode() == DocumentWriteRequest.WriteMode.REPLACE) {
                        transaction.set(docRef, payload);
                    } else {
                        transaction.set(docRef, payload, SetOptions.merge());
                    }
                    return null;
                }).get();
            } catch (ExecutionException e) {
                throw unwrapCause(e);
            }

            return readDocumentDetails(firestore, normalizedPath);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-104: Deletes a document, optionally guarded by an atomic server-side
     * {@code updateTime} precondition.
     */
    public Mono<Void> deleteDocument(
            String projectId,
            String databaseId,
            String documentPath,
            Instant expectedUpdateTime) {
        return Mono.fromCallable(() -> {
            String normalizedPath = normalizeDocumentPath(documentPath);
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(normalizedPath);

            try {
                if (expectedUpdateTime != null) {
                    com.google.cloud.Timestamp expected = com.google.cloud.Timestamp.ofTimeSecondsAndNanos(
                            expectedUpdateTime.getEpochSecond(), expectedUpdateTime.getNano());
                    docRef.delete(Precondition.updatedAt(expected)).get();
                } else {
                    docRef.delete().get();
                }
            } catch (ExecutionException e) {
                if (expectedUpdateTime != null && isFailedPrecondition(e)) {
                    DocumentDto latest = readDocumentIfExists(firestore, normalizedPath);
                    throw new OptimisticConcurrencyException(
                            "Document '" + normalizedPath + "' was modified since it was last read.", latest);
                }
                throw unwrapCause(e);
            }
            return (Void) null;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-106: Atomically deletes at most {@value #MAX_BULK_DELETE_PATHS} unique, validated
     * document paths in a single batch. Larger or invalid requests are rejected up front.
     */
    public Mono<BulkDeleteResult> batchDeleteDocuments(
            String projectId,
            String databaseId,
            List<String> documentPaths) {
        return Mono.fromCallable(() -> {
            List<String> validatedPaths = validateBulkDeletePaths(documentPaths);

            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            WriteBatch writeBatch = firestore.batch();
            for (String path : validatedPaths) {
                writeBatch.delete(firestore.document(path));
            }

            try {
                writeBatch.commit().get();
            } catch (Exception e) {
                log.warn("Atomic bulk delete of {} document(s) failed: {}", validatedPaths.size(), e.getMessage());
                return new BulkDeleteResult(List.of(), validatedPaths);
            }
            return new BulkDeleteResult(validatedPaths, List.of());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /** Visible for testing: dedupes, validates, and bounds a bulk delete path list. */
    static List<String> validateBulkDeletePaths(List<String> documentPaths) {
        if (documentPaths == null || documentPaths.isEmpty()) {
            throw new IllegalArgumentException("At least one document path is required.");
        }
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String rawPath : documentPaths) {
            String normalized = rawPath == null ? "" : rawPath.trim().replaceAll("^/+|/+$", "");
            if (normalized.isBlank()) {
                throw new IllegalArgumentException("Bulk delete paths cannot be blank.");
            }
            if (normalized.split("/").length % 2 != 0) {
                throw new IllegalArgumentException("Not a document path: '" + normalized + "'.");
            }
            unique.add(normalized);
        }
        if (unique.size() > MAX_BULK_DELETE_PATHS) {
            throw new IllegalArgumentException(
                    "Bulk delete accepts at most " + MAX_BULK_DELETE_PATHS
                            + " unique document paths per request, got " + unique.size() + ".");
        }
        return List.copyOf(unique);
    }

    /** Visible for testing: rejects malformed delete-field paths and REPLACE-mode deletions. */
    static List<String> validateDeleteFieldPaths(DocumentWriteRequest request) {
        List<String> deleteFieldPaths = request.deleteFieldPaths().stream()
                .filter(path -> path != null && !path.isBlank())
                .map(String::trim)
                .toList();
        if (deleteFieldPaths.isEmpty()) {
            return List.of();
        }
        if (request.mode() == DocumentWriteRequest.WriteMode.REPLACE) {
            throw new IllegalArgumentException(
                    "deleteFieldPaths is only valid in MERGE mode; REPLACE already removes omitted fields.");
        }
        for (String path : deleteFieldPaths) {
            for (String segment : path.split("\\.", -1)) {
                if (segment.isBlank()) {
                    throw new IllegalArgumentException("Invalid delete field path: '" + path + "'.");
                }
            }
        }
        return deleteFieldPaths;
    }

    /**
     * FFP-103: Inserts {@link FieldValue#delete()} sentinels for each delete path into the merge
     * payload, creating intermediate maps as needed. A delete path that collides with a submitted
     * value is rejected so a save can never both set and delete the same field.
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> withDeleteSentinels(Map<String, Object> fields, List<String> deleteFieldPaths) {
        Map<String, Object> merged = new LinkedHashMap<>(fields);
        for (String path : deleteFieldPaths) {
            String[] segments = path.split("\\.");
            Map<String, Object> current = merged;
            for (int i = 0; i < segments.length - 1; i += 1) {
                Object next = current.get(segments[i]);
                if (next == null && !current.containsKey(segments[i])) {
                    Map<String, Object> created = new LinkedHashMap<>();
                    current.put(segments[i], created);
                    next = created;
                }
                if (!(next instanceof Map)) {
                    throw new IllegalArgumentException(
                            "Delete field path '" + path + "' conflicts with a submitted non-map field.");
                }
                current = (Map<String, Object>) next;
            }
            String leaf = segments[segments.length - 1];
            if (current.containsKey(leaf)) {
                throw new IllegalArgumentException(
                        "Delete field path '" + path + "' conflicts with a submitted field value.");
            }
            current.put(leaf, FieldValue.delete());
        }
        return merged;
    }

    private void enforceUpdateTimePrecondition(
            DocumentSnapshot snapshot,
            Instant expectedUpdateTime,
            String documentPath) {
        if (snapshot.exists()) {
            if (expectedUpdateTime == null) {
                throw new IllegalArgumentException(
                        "expectedUpdateTime is required when writing to an existing document. "
                                + "Reload the document and retry.");
            }
            Instant actual = toInstant(snapshot.getUpdateTime());
            if (!expectedUpdateTime.equals(actual)) {
                throw new OptimisticConcurrencyException(
                        "Document '" + documentPath + "' was modified since it was last read.",
                        toDocumentDto(snapshot, documentPath));
            }
        } else if (expectedUpdateTime != null) {
            throw new OptimisticConcurrencyException(
                    "Document '" + documentPath + "' no longer exists.", null);
        }
    }

    private DocumentDto readDocumentDetails(Firestore firestore, String documentPath) throws Exception {
        DocumentReference docRef = firestore.document(documentPath);
        DocumentSnapshot document = docRef.get().get();

        if (!document.exists()) {
            throw new NotFoundException("Document not found: " + documentPath);
        }

        Iterable<CollectionReference> collections = docRef.listCollections();
        List<String> subcollections = StreamSupport.stream(collections.spliterator(), false)
                .map(CollectionReference::getId)
                .collect(Collectors.toList());

        Map<String, Object> rawData = document.getData() != null ? document.getData() : new HashMap<>();
        return DocumentDto.of(
                docRef.getId(),
                documentPath,
                rawData,
                toInstant(document.getCreateTime()),
                toInstant(document.getUpdateTime()),
                subcollections);
    }

    private DocumentDto readDocumentIfExists(Firestore firestore, String documentPath) {
        try {
            return readDocumentDetails(firestore, documentPath);
        } catch (Exception e) {
            return null;
        }
    }

    private DocumentDto toDocumentDto(DocumentSnapshot doc) {
        return toDocumentDto(doc, doc.getReference().getPath());
    }

    private DocumentDto toDocumentDto(DocumentSnapshot doc, String path) {
        Map<String, Object> rawData = doc.getData() != null ? doc.getData() : new HashMap<>();
        return DocumentDto.of(
                doc.getId(),
                path,
                rawData,
                toInstant(doc.getCreateTime()),
                toInstant(doc.getUpdateTime()),
                List.of());
    }

    /** Full-precision conversion; {@code toDate().toInstant()} would truncate to milliseconds. */
    private static Instant toInstant(com.google.cloud.Timestamp timestamp) {
        return timestamp == null ? null : Instant.ofEpochSecond(timestamp.getSeconds(), timestamp.getNanos());
    }

    private static String normalizeDocumentPath(String documentPath) {
        String normalized = documentPath == null ? "" : documentPath.trim().replaceAll("^/+|/+$", "");
        if (normalized.isBlank() || normalized.split("/").length % 2 != 0) {
            throw new IllegalArgumentException(
                    "A document path with an even number of segments is required, got: '"
                            + documentPath + "'.");
        }
        return normalized;
    }

    private static RuntimeException unwrapCause(ExecutionException e) {
        Throwable cause = e.getCause();
        while (cause != null) {
            if (cause instanceof OptimisticConcurrencyException oce) {
                return oce;
            }
            if (cause instanceof IllegalArgumentException iae) {
                return iae;
            }
            cause = cause.getCause();
        }
        Throwable root = e.getCause() != null ? e.getCause() : e;
        return root instanceof RuntimeException re ? re : new RuntimeException(root);
    }

    private static boolean isFailedPrecondition(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof com.google.api.gax.rpc.FailedPreconditionException) {
                return true;
            }
            String message = current.getMessage();
            if (message != null && message.contains("FAILED_PRECONDITION")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    public Mono<List<String>> getAllDatabases(String projectId, String databaseId) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            FirestoreOptions options = (FirestoreOptions) firestore.getOptions();

            FirestoreAdminSettings adminSettings = FirestoreAdminSettings.newBuilder()
                    .setCredentialsProvider(FixedCredentialsProvider.create(options.getCredentials()))
                    .build();

            try (FirestoreAdminClient adminClient = FirestoreAdminClient.create(adminSettings)) {
                String parent = "projects/" + options.getProjectId();
                List<String> databaseIds = new ArrayList<>();

                for (Database database : adminClient.listDatabases(parent).getDatabasesList()) {
                    String name = database.getName();
                    String dbId = name.substring(name.lastIndexOf('/') + 1);
                    databaseIds.add(dbId);
                }
                return databaseIds;
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<List<String>> getAllDatabases() {
        return Mono.fromCallable(() -> {
            FirestoreOptions options = (FirestoreOptions) firestoreManagerService.getFirestore().getOptions();

            FirestoreAdminSettings adminSettings = FirestoreAdminSettings.newBuilder()
                    .setCredentialsProvider(FixedCredentialsProvider.create(options.getCredentials()))
                    .build();

            try (FirestoreAdminClient adminClient = FirestoreAdminClient.create(adminSettings)) {
                String parent = "projects/" + options.getProjectId();
                List<String> databaseIds = new ArrayList<>();

                for (Database database : adminClient.listDatabases(parent).getDatabasesList()) {
                    String name = database.getName();
                    String dbId = name.substring(name.lastIndexOf('/') + 1);
                    databaseIds.add(dbId);
                }
                return databaseIds;
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<List<String>> getAllCollections(String projectId, String databaseId) {
        return Mono.fromCallable(() -> {
            Iterable<CollectionReference> collections = firestoreManagerService.getFirestore(projectId, databaseId).listCollections();
            return StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<List<String>> getAllCollections() {
        return Mono.fromCallable(() -> {
            Iterable<CollectionReference> collections = firestoreManagerService.getFirestore().listCollections();
            return StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> createDocument(
            String projectId,
            String databaseId,
            String collectionPath,
            String docId,
            Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            return createDocumentInternal(firestore, collectionPath, docId, data);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> createDocument(String collectionPath, Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore();
            return createDocumentInternal(firestore, collectionPath, null, data);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> createDocument(
            String collectionPath,
            String docId,
            Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore();
            return createDocumentInternal(firestore, collectionPath, docId, data);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-101: Full collection read returning typed documents so exports keep native types.
     */
    public Mono<List<DocumentDto>> getAllDocuments(String projectId, String databaseId, String collectionPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            List<QueryDocumentSnapshot> documents = firestore
                    .collection(collectionPath)
                    .get()
                    .get()
                    .getDocuments();
            return documents.stream()
                    .map(this::toDocumentDto)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<NodePage> listDocumentNodesPage(
            String projectId,
            String databaseId,
            String collectionPath,
            int limit,
            String cursor,
            String idFilter) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            int safeLimit = Math.max(1, Math.min(limit, 100));
            String normalizedFilter = idFilter == null ? "" : idFilter.trim();

            Query query = firestore.collection(collectionPath)
                    .orderBy(FieldPath.documentId(), Query.Direction.ASCENDING);

            if (!normalizedFilter.isBlank()) {
                query = query
                        .whereGreaterThanOrEqualTo(FieldPath.documentId(), normalizedFilter)
                        .whereLessThanOrEqualTo(FieldPath.documentId(), normalizedFilter + "");
            }

            if (cursor != null && !cursor.isBlank()) {
                query = query.startAfter(cursor);
            }
            query = query.limit(safeLimit + 1);

            List<QueryDocumentSnapshot> fetched = query.get().get().getDocuments();
            boolean hasMore = fetched.size() > safeLimit;
            List<QueryDocumentSnapshot> pageDocuments = fetched.stream()
                    .limit(safeLimit)
                    .toList();

            List<NestedNode> nodes = pageDocuments.stream()
                    .map(document -> new NestedNode(document.getId(), document.getReference().getPath()))
                    .toList();

            String nextCursor = hasMore && !pageDocuments.isEmpty()
                    ? pageDocuments.get(pageDocuments.size() - 1).getId()
                    : null;

            return new NodePage(nodes, nextCursor, hasMore, safeLimit);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<NodePage> listSubcollectionNodesPage(
            String projectId,
            String databaseId,
            String documentPath,
            int limit,
            String cursor,
            String idFilter) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            int safeLimit = Math.max(1, Math.min(limit, 100));
            String normalizedFilter = idFilter == null ? "" : idFilter.trim();
            String normalizedFilterLower = normalizedFilter.toLowerCase(Locale.ROOT);

            List<NestedNode> allNodes = StreamSupport.stream(docRef.listCollections().spliterator(), false)
                    .map(CollectionReference::getId)
                    .filter(id -> id != null && !id.isBlank())
                    .filter(id -> normalizedFilter.isBlank()
                            || id.toLowerCase(Locale.ROOT).contains(normalizedFilterLower))
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .map(id -> new NestedNode(id, documentPath + "/" + id))
                    .toList();

            int startIndex = 0;
            if (cursor != null && !cursor.isBlank()) {
                for (int i = 0; i < allNodes.size(); i += 1) {
                    if (allNodes.get(i).id().equals(cursor)) {
                        startIndex = i + 1;
                        break;
                    }
                }
            }

            if (startIndex >= allNodes.size()) {
                return new NodePage(List.of(), null, false, safeLimit);
            }

            int endExclusive = Math.min(allNodes.size(), startIndex + safeLimit);
            List<NestedNode> pageNodes = allNodes.subList(startIndex, endExclusive);
            boolean hasMore = endExclusive < allNodes.size();
            String nextCursor = hasMore ? pageNodes.get(pageNodes.size() - 1).id() : null;

            return new NodePage(pageNodes, nextCursor, hasMore, safeLimit);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<PaginatedDocuments> getAllDocumentsPage(
            String projectId,
            String databaseId,
            String collectionPath,
            int page,
            int limit) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            int safeLimit = Math.max(1, Math.min(limit, 500));
            int safePage = Math.max(0, page);
            Query query = firestore.collection(collectionPath);
            if (safePage > 0) {
                query = query.offset(safePage * safeLimit);
            }
            query = query.limit(safeLimit + 1);

            List<QueryDocumentSnapshot> fetched = query.get().get().getDocuments();
            boolean hasNextPage = fetched.size() > safeLimit;
            List<DocumentDto> documents = fetched.stream()
                    .limit(safeLimit)
                    .map(this::toDocumentDto)
                    .collect(Collectors.toList());

            return new PaginatedDocuments(documents, safePage, safeLimit, hasNextPage);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<List<String>> listSubcollections(String projectId, String databaseId, String documentPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            Iterable<CollectionReference> collections = docRef.listCollections();
            return StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> replaceDocument(
            String projectId,
            String databaseId,
            String documentPath,
            Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            Map<String, Object> mutable = new LinkedHashMap<>(data == null ? Map.of() : data);
            ApiFuture<WriteResult> result = firestore
                    .document(documentPath)
                    .set(mutable);
            result.get();
            String id = documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
            mutable.put("id", id);
            return mutable;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private Query applyWhere(Query query, String field, String operator, Object value) {
        String normalizedField = field == null ? "" : field.trim();
        String normalizedOperator = operator == null ? "" : operator.trim();
        boolean isDocumentIdField = "id".equalsIgnoreCase(normalizedField);

        if (isDocumentIdField) {
            return switch (normalizedOperator) {
                case "==" -> query.whereEqualTo(FieldPath.documentId(), value);
                case "!=" -> query.whereNotEqualTo(FieldPath.documentId(), value);
                case ">" -> query.whereGreaterThan(FieldPath.documentId(), value);
                case ">=" -> query.whereGreaterThanOrEqualTo(FieldPath.documentId(), value);
                case "<" -> query.whereLessThan(FieldPath.documentId(), value);
                case "<=" -> query.whereLessThanOrEqualTo(FieldPath.documentId(), value);
                case "in" -> query.whereIn(FieldPath.documentId(), (List<?>) value);
                case "not-in" -> query.whereNotIn(FieldPath.documentId(), (List<?>) value);
                default -> throw new IllegalArgumentException("Unsupported where operator for documentId: " + operator);
            };
        }

        return switch (normalizedOperator) {
            case "==" -> query.whereEqualTo(normalizedField, value);
            case "!=" -> query.whereNotEqualTo(normalizedField, value);
            case ">" -> query.whereGreaterThan(normalizedField, value);
            case ">=" -> query.whereGreaterThanOrEqualTo(normalizedField, value);
            case "<" -> query.whereLessThan(normalizedField, value);
            case "<=" -> query.whereLessThanOrEqualTo(normalizedField, value);
            case "array-contains" -> query.whereArrayContains(normalizedField, value);
            case "array-contains-any" -> query.whereArrayContainsAny(normalizedField, (List<?>) value);
            case "in" -> query.whereIn(normalizedField, (List<?>) value);
            case "not-in" -> query.whereNotIn(normalizedField, (List<?>) value);
            default -> throw new IllegalArgumentException("Unsupported where operator: " + operator);
        };
    }

    private Map<String, Object> createDocumentInternal(
            Firestore firestore,
            String collectionPath,
            String requestedDocId,
            Map<String, Object> data) throws Exception {
        Map<String, Object> mutable = new HashMap<>(data == null ? Map.of() : data);
        String explicitDocId = normalizedOptionalString(requestedDocId);
        String payloadDocId = normalizedOptionalString(mutable.get("id"));

        if (!explicitDocId.isEmpty() && (explicitDocId.contains("/") || ".".equals(explicitDocId) || "..".equals(explicitDocId))) {
            throw new IllegalArgumentException("Document ID cannot contain '/' and cannot be '.' or '..'.");
        }
        if (!payloadDocId.isEmpty() && (payloadDocId.contains("/") || ".".equals(payloadDocId) || "..".equals(payloadDocId))) {
            throw new IllegalArgumentException("Payload field 'id' is invalid. It cannot contain '/' and cannot be '.' or '..'.");
        }

        String finalDocId = !explicitDocId.isEmpty() ? explicitDocId : payloadDocId;

        DocumentReference docRef;
        if (!finalDocId.isEmpty()) {
            docRef = firestore.collection(collectionPath).document(finalDocId);
        } else {
            docRef = firestore.collection(collectionPath).document();
            mutable.put("id", docRef.getId());
        }

        ApiFuture<WriteResult> result = docRef.set(mutable);
        result.get();

        Map<String, Object> response = new LinkedHashMap<>(mutable);
        response.put("id", docRef.getId());
        response.put("_path", docRef.getPath());
        return response;
    }

    private String normalizedOptionalString(Object value) {
        if (value == null) {
            return "";
        }
        return value.toString().trim();
    }
}
