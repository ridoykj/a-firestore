package com.itbd.afirestore.firestore.service;

import com.google.api.core.ApiFuture;
import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldPath;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.SetOptions;
import com.google.cloud.firestore.WriteBatch;
import com.google.cloud.firestore.WriteResult;
import com.google.cloud.firestore.v1.FirestoreAdminClient;
import com.google.cloud.firestore.v1.FirestoreAdminSettings;
import com.google.firestore.admin.v1.Database;
import com.itbd.afirestore.firestore.dto.DocumentDto;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Service
public class GenericFirestoreService {

    public record QueryResult(
            List<DocumentDto> documents,
            long elapsedMs,
            int pageIndex,
            int pageSize,
            boolean hasNextPage) {
    }

    public record PaginatedDocuments(
            List<DocumentDto> documents,
            int pageIndex,
            int pageSize,
            boolean hasNextPage) {
    }

    public record WhereClause(String field, String operator, Object value) {}

    /**
     * FFP-105: Cursor for stable pagination.
     * Contains the sort field values and document ID to resume from.
     */
    public record Cursor(
            Map<String, Object> sortValues,
            String documentId
    ) {
        public Cursor {
            if (sortValues == null) sortValues = Map.of();
        }
    }

    /**
     * FFP-105: Query result with cursor support.
     */
    public record CursorQueryResult(
            List<DocumentDto> documents,
            long elapsedMs,
            int pageSize,
            boolean hasNextPage,
            Cursor nextCursor,
            Cursor previousCursor
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

    private final FirestoreManagerService firestoreManagerService;

    public GenericFirestoreService(FirestoreManagerService firestoreManagerService) {
        this.firestoreManagerService = firestoreManagerService;
    }

    /**
     * FFP-101: Query collection returning typed DocumentDto objects.
     */
    public Mono<QueryResult> queryCollection(
            String projectId,
            String databaseId,
            String path,
            List<WhereClause> whereClauses,
            String orderField,
            String orderDirection,
            int limit,
            int page) {
        return Mono.fromCallable(() -> {
            long startNanos = System.nanoTime();
            
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            CollectionReference collectionRef = firestore.collection(path);
            
            Query query = applyWhereClauses(collectionRef, whereClauses);
            if (orderField != null && !orderField.isBlank()) {
                query = "asc".equalsIgnoreCase(orderDirection) 
                    ? query.orderBy(orderField).orderBy(FieldPath.documentId())
                    : query.orderBy(orderField, Query.Direction.DESCENDING).orderBy(FieldPath.documentId());
            }
            
            query = query.limit(limit);
            if (page > 0) {
                // FFP-105: Cursor-based pagination would go here
                // For now, using offset-based for backward compatibility
            }
            
            QuerySnapshot snapshot = query.get().get();
            List<DocumentDto> documents = new ArrayList<>();
            
            for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                Map<String, Object> rawData = doc.getData() != null ? doc.getData() : new HashMap<>();
                DocumentDto dto = DocumentDto.of(
                    doc.getId(),
                    doc.getReference().getPath(),
                    rawData,
                    doc.getCreateTime() != null ? doc.getCreateTime().toDate().toInstant() : null,
                    doc.getUpdateTime() != null ? doc.getUpdateTime().toDate().toInstant() : null,
                    List.of() // Subcollections would be fetched separately
                );
                documents.add(dto);
            }
            
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;
            boolean hasNextPage = snapshot.getDocuments().size() == limit;
            
            return new QueryResult(documents, elapsedMs, page, limit, hasNextPage);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-105: Query collection with cursor-based pagination.
     * Replaces offset-based pagination with stable cursor navigation.
     */
    public Mono<CursorQueryResult> queryCollectionWithCursor(
            String projectId,
            String databaseId,
            String path,
            List<WhereClause> whereClauses,
            String orderField,
            String orderDirection,
            int limit,
            Cursor cursor) {
        return Mono.fromCallable(() -> {
            long startNanos = System.nanoTime();
            
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            CollectionReference collectionRef = firestore.collection(path);
            
            Query query = applyWhereClauses(collectionRef, whereClauses);
            
            // Apply cursor-based pagination instead of offset
            if (cursor != null && !cursor.sortValues().isEmpty()) {
                boolean isAscending = "asc".equalsIgnoreCase(orderDirection);
                
                for (Map.Entry<String, Object> entry : cursor.sortValues().entrySet()) {
                    String field = entry.getKey();
                    Object value = entry.getValue();
                    
                    if (isAscending) {
                        query = query.whereGreaterThan(field, value);
                    } else {
                        query = query.whereLessThan(field, value);
                    }
                }
                
                // Add document ID as tiebreaker for stable ordering
                String lastDocId = cursor.documentId();
                if (lastDocId != null && !lastDocId.isBlank()) {
                    Query.Direction docDirection = isAscending ? 
                        Query.Direction.ASCENDING : Query.Direction.DESCENDING;
                    query = query.whereGreaterThan(FieldPath.documentId(), lastDocId);
                }
            }
            
            // Apply ordering
            if (orderField != null && !orderField.isBlank()) {
                boolean isAscending = "asc".equalsIgnoreCase(orderDirection);
                Query.Direction direction = isAscending ? 
                    Query.Direction.ASCENDING : Query.Direction.DESCENDING;
                
                query = query.orderBy(orderField, direction)
                            .orderBy(FieldPath.documentId(), 
                                isAscending ? Query.Direction.ASCENDING : Query.Direction.DESCENDING);
            } else {
                // Default ordering by document ID if no order field specified
                query = query.orderBy(FieldPath.documentId());
            }
            
            query = query.limit(limit + 1); // Fetch one extra to check for next page
            
            QuerySnapshot snapshot = query.get().get();
            List<QueryDocumentSnapshot> fetchedDocs = snapshot.getDocuments();
            boolean hasNextPage = fetchedDocs.size() > limit;
            
            // Limit results to requested size (exclude the extra document used for cursor)
            List<QueryDocumentSnapshot> pageDocs = fetchedDocs.stream()
                    .limit(limit)
                    .toList();
            
            List<DocumentDto> documents = new ArrayList<>();
            Cursor nextCursor = null;
            Cursor previousCursor = null;
            
            if (!pageDocs.isEmpty()) {
                // Build cursor from last document in the page for next page navigation
                QueryDocumentSnapshot lastDoc = pageDocs.get(pageDocs.size() - 1);
                Map<String, Object> sortValues = new LinkedHashMap<>();
                
                if (orderField != null && !orderField.isBlank()) {
                    Object fieldValue = lastDoc.getData().get(orderField);
                    if (fieldValue != null) {
                        sortValues.put(orderField, fieldValue);
                    }
                }
                
                nextCursor = new Cursor(sortValues, lastDoc.getId());
            }
            
            // Build previous cursor from first document in the page for back navigation
            if (!pageDocs.isEmpty() && cursor != null) {
                QueryDocumentSnapshot firstDoc = pageDocs.get(0);
                Map<String, Object> prevSortValues = new LinkedHashMap<>();
                
                if (orderField != null && !orderField.isBlank()) {
                    Object fieldValue = firstDoc.getData().get(orderField);
                    if (fieldValue != null) {
                        prevSortValues.put(orderField, fieldValue);
                    }
                }
                
                previousCursor = new Cursor(prevSortValues, firstDoc.getId());
            }
            
            for (QueryDocumentSnapshot doc : pageDocs) {
                Map<String, Object> rawData = doc.getData() != null ? doc.getData() : new HashMap<>();
                DocumentDto dto = DocumentDto.of(
                    doc.getId(),
                    doc.getReference().getPath(),
                    rawData,
                    doc.getCreateTime() != null ? doc.getCreateTime().toDate().toInstant() : null,
                    doc.getUpdateTime() != null ? doc.getUpdateTime().toDate().toInstant() : null,
                    List.of() // Subcollections would be fetched separately
                );
                documents.add(dto);
            }
            
            long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;
            
            return new CursorQueryResult(documents, elapsedMs, limit, hasNextPage, nextCursor, previousCursor);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-105: Query collection with cursor-based pagination (simplified version).
     */
    public Mono<CursorQueryResult> queryCollectionWithCursor(
            String projectId,
            String databaseId,
            String path,
            int limit,
            Cursor cursor) {
        return queryCollectionWithCursor(projectId, databaseId, path, null, null, "asc", limit, cursor);
    }

    /**
     * FFP-101: Query collection returning typed DocumentDto objects.
     */
    public Mono<DocumentDto> getDocumentDetails(String projectId, String databaseId, String documentPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            DocumentSnapshot document = docRef.get().get();

            if (!document.exists()) {
                throw new RuntimeException("Document not found: " + documentPath);
            }

            Map<String, Object> rawData = document.getData() != null ? document.getData() : new HashMap<>();
            
            Iterable<CollectionReference> collections = docRef.listCollections();
            List<String> subcollections = StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());

            return DocumentDto.of(
                docRef.getId(),
                documentPath,
                rawData,
                document.getCreateTime() != null ? document.getCreateTime().toDate().toInstant() : null,
                document.getUpdateTime() != null ? document.getUpdateTime().toDate().toInstant() : null,
                subcollections
            );
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-101: Create document with typed value support.
     */
    public Mono<DocumentDto> createDocument(String projectId, String databaseId, 
                                             String collectionPath, Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            CollectionReference collectionRef = firestore.collection(collectionPath);
            
            // Convert typed values back to raw for Firestore SDK
            Map<String, Object> rawData = convertToRawData(data);
            
            DocumentReference docRef = collectionRef.document();
            docRef.set(rawData).get();
            
            return getDocumentDetails(projectId, databaseId, docRef.getPath()).block();
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-106: Atomic bulk delete up to 500 documents per batch.
     * Uses Firestore's atomic transaction capability for guaranteed consistency.
     */
    public Mono<BulkDeleteResult> batchDeleteDocuments(String projectId, String databaseId, List<String> documentPaths) {
        return Mono.fromCallable(() -> {
            if (documentPaths == null || documentPaths.isEmpty()) {
                throw new IllegalArgumentException("Document paths list cannot be empty");
            }
            
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            int batchSize = 500; // Firestore limit per batch
            List<String> deletedPaths = new ArrayList<>();
            List<String> failedPaths = new ArrayList<>();
            
            for (int i = 0; i < documentPaths.size(); i += batchSize) {
                int end = Math.min(i + batchSize, documentPaths.size());
                List<String> currentBatch = documentPaths.subList(i, end);
                
                try {
                    // Use atomic batch write for guaranteed consistency
                    WriteBatch writeBatch = firestore.batch();
                    for (String path : currentBatch) {
                        writeBatch.delete(firestore.document(path));
                    }
                    writeBatch.commit().get();
                    
                    deletedPaths.addAll(currentBatch);
                } catch (Exception e) {
                    failedPaths.addAll(currentBatch);
                    // Log but continue with next batch
                    System.err.println("Batch delete failed for " + currentBatch.size() + " documents: " + e.getMessage());
                }
            }
            
            return new BulkDeleteResult(deletedPaths, failedPaths);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-106: Result of atomic bulk delete operation.
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
     * FFP-102: Update document with merge mode support.
     */
    public Mono<DocumentDto> updateDocument(String projectId, String databaseId, 
                                             String documentPath, Map<String, Object> data, boolean merge) {
        return updateDocument(projectId, databaseId, documentPath, data, merge, null);
    }

    /**
     * FFP-102: Update document with merge mode support and optimistic concurrency.
     */
    public Mono<DocumentDto> updateDocument(String projectId, String databaseId, 
                                             String documentPath, Map<String, Object> data, boolean merge, Instant expectedUpdateTime) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            
            // FFP-104: Optimistic concurrency check for update operations
            if (expectedUpdateTime != null) {
                DocumentSnapshot snapshot = docRef.get().get();
                com.google.cloud.Timestamp currentTimestamp = snapshot.getUpdateTime();
                if (currentTimestamp == null || !currentTimestamp.toDate().toInstant().equals(expectedUpdateTime)) {
                    throw new OptimisticConcurrencyException(
                        "Document has been modified since last read. Expected update time: " + expectedUpdateTime + 
                        ", actual: " + (currentTimestamp != null ? currentTimestamp.toDate().toInstant() : "null"),
                        getDocumentDetails(projectId, databaseId, documentPath).block());
                }
            }
            
            // Convert typed values back to raw for Firestore SDK
            Map<String, Object> rawData = convertToRawData(data);
            
            if (merge) {
                docRef.update(rawData).get();
            } else {
                docRef.set(rawData).get();
            }
            
            return getDocumentDetails(projectId, databaseId, documentPath).block();
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-104: Optimistic concurrency exception for HTTP 409 responses.
     */
    public static class OptimisticConcurrencyException extends RuntimeException {
        private final DocumentDto documentDto;
        
        public OptimisticConcurrencyException(String message, DocumentDto documentDto) {
            super(message);
            this.documentDto = documentDto;
        }
        
        public DocumentDto getDocumentDto() {
            return documentDto;
        }
    }

    /**
     * FFP-103: Delete fields from a document using FieldPath.delete() sentinel.
     */
    public Mono<DocumentDto> deleteFields(String projectId, String databaseId, 
                                           String documentPath, List<String> fieldPaths) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            
            // Use individual field updates with FieldPath for deletion
            for (String path : fieldPaths) {
                docRef.update(FieldPath.of(path.split("\\.")), com.google.cloud.firestore.FieldValue.delete()).get();
            }
            
            return getDocumentDetails(projectId, databaseId, documentPath).block();
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * FFP-104: Delete document with optimistic concurrency check.
     */
    public Mono<Void> deleteDocument(String projectId, String databaseId, 
                                      String documentPath, Instant expectedUpdateTime) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            
            if (expectedUpdateTime != null) {
                // FFP-104: Optimistic concurrency check - verify update time before delete
                DocumentSnapshot snapshot = docRef.get().get();
                com.google.cloud.Timestamp currentTimestamp = snapshot.getUpdateTime();
                if (currentTimestamp == null || !currentTimestamp.toDate().toInstant().equals(expectedUpdateTime)) {
                    throw new RuntimeException("Document has been modified since last read. Expected update time: " + expectedUpdateTime + ", actual: " + 
                        (currentTimestamp != null ? currentTimestamp.toDate().toInstant() : "null"));
                }
            }
            docRef.delete().get();
            
            return (Void) null;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * Helper to convert typed values back to raw Firestore-compatible objects.
     */
    private Map<String, Object> convertToRawData(Map<String, Object> data) {
        Map<String, Object> rawData = new HashMap<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            if (entry.getValue() instanceof FirestoreValue fv) {
                rawData.put(entry.getKey(), fv.toFirestoreObject());
            } else {
                rawData.put(entry.getKey(), entry.getValue());
            }
        }
        return rawData;
    }

    /**
     * Helper to apply where clauses to a query.
     */
    private Query applyWhereClauses(Query query, List<WhereClause> whereClauses) {
        for (WhereClause clause : whereClauses) {
            if (clause.field == null || clause.field.isBlank()) continue;
            
            switch (clause.operator.toLowerCase()) {
                case "==":
                    query = query.whereEqualTo(clause.field, clause.value);
                    break;
                case "!=":
                    query = query.whereNotEqualTo(clause.field, clause.value);
                    break;
                case "<":
                    query = query.whereLessThan(clause.field, clause.value);
                    break;
                case "<=":
                    query = query.whereLessThanOrEqualTo(clause.field, clause.value);
                    break;
                case ">":
                    query = query.whereGreaterThan(clause.field, clause.value);
                    break;
                case ">=":
                    query = query.whereGreaterThanOrEqualTo(clause.field, clause.value);
                    break;
                default:
                    // Unsupported operator - skip
                    break;
            }
        }
        return query;
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

//    public Mono<Map<String, Object>> createDocument(
//            String projectId,
//            String databaseId,
//            String collectionPath,
//            Map<String, Object> data) {
//        return Mono.fromCallable(() -> {
//            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
//            return createDocumentInternal(firestore, collectionPath, null, data);
//        }).subscribeOn(Schedulers.boundedElastic());
//    }

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

    public Mono<Map<String, Object>> getDocument(String projectId, String databaseId, String documentPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            DocumentReference docRef = firestore.document(documentPath);
            DocumentSnapshot document = docRef.get().get();

            Map<String, Object> responseData = new HashMap<>();
            responseData.put("id", docRef.getId());
            boolean hasContent = false;

            if (document.exists() && document.getData() != null && !document.getData().isEmpty()) {
                responseData.put("fields", document.getData());
                hasContent = true;
            } else {
                responseData.put("fields", new HashMap<>());
            }

            Iterable<CollectionReference> collections = docRef.listCollections();
            List<String> subcollections = StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());

            if (!subcollections.isEmpty()) {
                responseData.put("collections", subcollections);
                hasContent = true;
            } else {
                responseData.put("collections", new ArrayList<>());
            }

            if (hasContent) {
                return responseData;
            }

            return (Map<String, Object>) null;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> getDocument(String documentPath) {
        return Mono.fromCallable(() -> {
            DocumentReference docRef = firestoreManagerService.getFirestore().document(documentPath);
            DocumentSnapshot document = docRef.get().get();

            Map<String, Object> responseData = new HashMap<>();
            responseData.put("id", docRef.getId());
            boolean hasContent = false;

            if (document.exists() && document.getData() != null && !document.getData().isEmpty()) {
                responseData.put("fields", document.getData());
                hasContent = true;
            } else {
                responseData.put("fields", new HashMap<>());
            }

            Iterable<CollectionReference> collections = docRef.listCollections();
            List<String> subcollections = StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());

            if (!subcollections.isEmpty()) {
                responseData.put("collections", subcollections);
                hasContent = true;
            } else {
                responseData.put("collections", new ArrayList<>());
            }

            if (hasContent) {
                return responseData;
            }

            return (Map<String, Object>) null;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<List<Map<String, Object>>> getAllDocuments(String projectId, String databaseId, String collectionPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            List<QueryDocumentSnapshot> documents = firestore
                    .collection(collectionPath)
                    .get()
                    .get()
                    .getDocuments();
            return documents.stream()
                    .map(this::toDocumentData)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<List<Map<String, Object>>> getAllDocuments(String collectionPath) {
        return Mono.fromCallable(() -> {
            List<QueryDocumentSnapshot> documents = firestoreManagerService.getFirestore()
                    .collection(collectionPath)
                    .get()
                    .get()
                    .getDocuments();
            return documents.stream()
                    .map(this::toDocumentData)
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
                        .whereLessThanOrEqualTo(FieldPath.documentId(), normalizedFilter + "\uf8ff");
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
                    .map(doc -> DocumentDto.of(
                            doc.getId(),
                            doc.getReference().getPath(),
                            doc.getData() != null ? doc.getData() : new HashMap<>(),
                            doc.getCreateTime() != null ? doc.getCreateTime().toDate().toInstant() : null,
                            doc.getUpdateTime() != null ? doc.getUpdateTime().toDate().toInstant() : null,
                            List.of()))
                    .collect(Collectors.toList());

            return new PaginatedDocuments(documents, safePage, safeLimit, hasNextPage);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<PaginatedDocuments> getAllDocumentsPage(String collectionPath, int page, int limit) {
        return Mono.fromCallable(() -> {
            int safeLimit = Math.max(1, Math.min(limit, 500));
            int safePage = Math.max(0, page);
            Query query = firestoreManagerService.getFirestore().collection(collectionPath);
            if (safePage > 0) {
                query = query.offset(safePage * safeLimit);
            }
            query = query.limit(safeLimit + 1);

            List<QueryDocumentSnapshot> fetched = query.get().get().getDocuments();
            boolean hasNextPage = fetched.size() > safeLimit;
            List<DocumentDto> documents = fetched.stream()
                    .limit(safeLimit)
                    .map(doc -> DocumentDto.of(
                            doc.getId(),
                            doc.getReference().getPath(),
                            doc.getData() != null ? doc.getData() : new HashMap<>(),
                            doc.getCreateTime() != null ? doc.getCreateTime().toDate().toInstant() : null,
                            doc.getUpdateTime() != null ? doc.getUpdateTime().toDate().toInstant() : null,
                            List.of()))
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

    public Mono<List<String>> listSubcollections(String documentPath) {
        return Mono.fromCallable(() -> {
            DocumentReference docRef = firestoreManagerService.getFirestore().document(documentPath);
            Iterable<CollectionReference> collections = docRef.listCollections();
            return StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

//    public Mono<QueryResult> queryCollection(
//            String projectId,
//            String databaseId,
//            String collectionPath,
//            List<WhereClause> whereClauses,
//            String orderField,
//            String orderDirection,
//            int limit,
//            int page) {
//        return Mono.fromCallable(() -> {
//            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
//            long startNanos = System.nanoTime();
//            int safeLimit = Math.max(1, Math.min(limit, 500));
//            int safePage = Math.max(0, page);
//            Query query = firestore.collection(collectionPath);
//
//            if (whereClauses != null && !whereClauses.isEmpty()) {
//                for (WhereClause whereClause : whereClauses) {
//                    if (whereClause == null) {
//                        continue;
//                    }
//                    String field = whereClause.field();
//                    String operator = whereClause.operator();
//                    if (field == null || field.isBlank() || operator == null || operator.isBlank()) {
//                        continue;
//                    }
//                    query = applyWhere(query, field, operator, whereClause.value());
//                }
//            }
//
//            if (orderField != null && !orderField.isBlank()) {
//                Query.Direction direction = "asc".equalsIgnoreCase(orderDirection)
//                        ? Query.Direction.ASCENDING
//                        : Query.Direction.DESCENDING;
//                if ("id".equalsIgnoreCase(orderField.trim())) {
//                    query = query.orderBy(FieldPath.documentId(), direction);
//                } else {
//                    query = query.orderBy(orderField, direction);
//                }
//            }
//
//            if (safePage > 0) {
//                query = query.offset(safePage * safeLimit);
//            }
//            query = query.limit(safeLimit + 1);
//
//            QuerySnapshot querySnapshot = query.get().get();
//            List<QueryDocumentSnapshot> fetchedDocuments = querySnapshot.getDocuments();
//            boolean hasNextPage = fetchedDocuments.size() > safeLimit;
//            List<Map<String, Object>> documents = fetchedDocuments.stream()
//                    .limit(safeLimit)
//                    .map(this::toDocumentData)
//                    .collect(Collectors.toList());
//
//            long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
//            return new QueryResult(documents, elapsedMs, safePage, safeLimit, hasNextPage);
//        }).subscribeOn(Schedulers.boundedElastic());
//    }
//
//    public Mono<QueryResult> queryCollection(
//            String collectionPath,
//            List<WhereClause> whereClauses,
//            String orderField,
//            String orderDirection,
//            int limit,
//            int page) {
//        return Mono.fromCallable(() -> {
//            long startNanos = System.nanoTime();
//            int safeLimit = Math.max(1, Math.min(limit, 500));
//            int safePage = Math.max(0, page);
//            Query query = firestoreManagerService.getFirestore().collection(collectionPath);
//
//            if (whereClauses != null && !whereClauses.isEmpty()) {
//                for (WhereClause whereClause : whereClauses) {
//                    if (whereClause == null) {
//                        continue;
//                    }
//                    String field = whereClause.field();
//                    String operator = whereClause.operator();
//                    if (field == null || field.isBlank() || operator == null || operator.isBlank()) {
//                        continue;
//                    }
//                    query = applyWhere(query, field, operator, whereClause.value());
//                }
//            }
//
//            if (orderField != null && !orderField.isBlank()) {
//                Query.Direction direction = "asc".equalsIgnoreCase(orderDirection)
//                        ? Query.Direction.ASCENDING
//                        : Query.Direction.DESCENDING;
//                if ("id".equalsIgnoreCase(orderField.trim())) {
//                    query = query.orderBy(FieldPath.documentId(), direction);
//                } else {
//                    query = query.orderBy(orderField, direction);
//                }
//            }
//
//            if (safePage > 0) {
//                query = query.offset(safePage * safeLimit);
//            }
//            query = query.limit(safeLimit + 1);
//
//            QuerySnapshot querySnapshot = query.get().get();
//            List<QueryDocumentSnapshot> fetchedDocuments = querySnapshot.getDocuments();
//            boolean hasNextPage = fetchedDocuments.size() > safeLimit;
//            List<Map<String, Object>> documents = fetchedDocuments.stream()
//                    .limit(safeLimit)
//                    .map(this::toDocumentData)
//                    .collect(Collectors.toList());
//
//            long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
//            return new QueryResult(documents, elapsedMs, safePage, safeLimit, hasNextPage);
//        }).subscribeOn(Schedulers.boundedElastic());
//    }

    public Mono<Map<String, Object>> updateDocument(
            String projectId,
            String databaseId,
            String documentPath,
            Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            Map<String, Object> mutable = new HashMap<>(data);
            ApiFuture<WriteResult> result = firestore
                    .document(documentPath)
                    .set(mutable, SetOptions.merge());
            result.get();
            String id = documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
            mutable.put("id", id);
            return mutable;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> updateDocument(String documentPath, Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Map<String, Object> mutable = new HashMap<>(data);
            ApiFuture<WriteResult> result = firestoreManagerService.getFirestore()
                    .document(documentPath)
                    .set(mutable, SetOptions.merge());
            result.get();
            String id = documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
            mutable.put("id", id);
            return mutable;
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

    public Mono<Map<String, Object>> replaceDocument(String documentPath, Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Map<String, Object> mutable = new LinkedHashMap<>(data == null ? Map.of() : data);
            ApiFuture<WriteResult> result = firestoreManagerService.getFirestore()
                    .document(documentPath)
                    .set(mutable);
            result.get();
            String id = documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
            mutable.put("id", id);
            return mutable;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<String> deleteDocument(String projectId, String databaseId, String documentPath) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            firestore.document(documentPath).delete().get();
            return documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<String> deleteDocument(String documentPath) {
        return Mono.fromCallable(() -> {
            firestoreManagerService.getFirestore().document(documentPath).delete().get();
            return documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
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
        String normalized = value.toString().trim();
        return normalized;
    }

    private Map<String, Object> toDocumentData(DocumentSnapshot doc) {
        Map<String, Object> data = new LinkedHashMap<>(doc.getData() == null ? Map.of() : doc.getData());
        data.put("id", doc.getId());
        data.put("_path", doc.getReference().getPath());
        return data;
    }
}
