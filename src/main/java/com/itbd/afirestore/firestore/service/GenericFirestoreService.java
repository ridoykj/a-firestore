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
import com.google.cloud.firestore.WriteResult;
import com.google.cloud.firestore.v1.FirestoreAdminClient;
import com.google.cloud.firestore.v1.FirestoreAdminSettings;
import com.google.firestore.admin.v1.Database;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

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
            List<Map<String, Object>> documents,
            long elapsedMs,
            int pageIndex,
            int pageSize,
            boolean hasNextPage) {
    }

    public record PaginatedDocuments(
            List<Map<String, Object>> documents,
            int pageIndex,
            int pageSize,
            boolean hasNextPage) {
    }

    public record WhereClause(String field, String operator, Object value) {}

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
            Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            return createDocumentInternal(firestore, collectionPath, null, data);
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
            List<Map<String, Object>> documents = fetched.stream()
                    .limit(safeLimit)
                    .map(this::toDocumentData)
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
            List<Map<String, Object>> documents = fetched.stream()
                    .limit(safeLimit)
                    .map(this::toDocumentData)
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

    public Mono<QueryResult> queryCollection(
            String projectId,
            String databaseId,
            String collectionPath,
            List<WhereClause> whereClauses,
            String orderField,
            String orderDirection,
            int limit,
            int page) {
        return Mono.fromCallable(() -> {
            Firestore firestore = firestoreManagerService.getFirestore(projectId, databaseId);
            long startNanos = System.nanoTime();
            int safeLimit = Math.max(1, Math.min(limit, 500));
            int safePage = Math.max(0, page);
            Query query = firestore.collection(collectionPath);

            if (whereClauses != null && !whereClauses.isEmpty()) {
                for (WhereClause whereClause : whereClauses) {
                    if (whereClause == null) {
                        continue;
                    }
                    String field = whereClause.field();
                    String operator = whereClause.operator();
                    if (field == null || field.isBlank() || operator == null || operator.isBlank()) {
                        continue;
                    }
                    query = applyWhere(query, field, operator, whereClause.value());
                }
            }

            if (orderField != null && !orderField.isBlank()) {
                Query.Direction direction = "asc".equalsIgnoreCase(orderDirection)
                        ? Query.Direction.ASCENDING
                        : Query.Direction.DESCENDING;
                if ("id".equalsIgnoreCase(orderField.trim())) {
                    query = query.orderBy(FieldPath.documentId(), direction);
                } else {
                    query = query.orderBy(orderField, direction);
                }
            }

            if (safePage > 0) {
                query = query.offset(safePage * safeLimit);
            }
            query = query.limit(safeLimit + 1);

            QuerySnapshot querySnapshot = query.get().get();
            List<QueryDocumentSnapshot> fetchedDocuments = querySnapshot.getDocuments();
            boolean hasNextPage = fetchedDocuments.size() > safeLimit;
            List<Map<String, Object>> documents = fetchedDocuments.stream()
                    .limit(safeLimit)
                    .map(this::toDocumentData)
                    .collect(Collectors.toList());

            long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
            return new QueryResult(documents, elapsedMs, safePage, safeLimit, hasNextPage);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<QueryResult> queryCollection(
            String collectionPath,
            List<WhereClause> whereClauses,
            String orderField,
            String orderDirection,
            int limit,
            int page) {
        return Mono.fromCallable(() -> {
            long startNanos = System.nanoTime();
            int safeLimit = Math.max(1, Math.min(limit, 500));
            int safePage = Math.max(0, page);
            Query query = firestoreManagerService.getFirestore().collection(collectionPath);

            if (whereClauses != null && !whereClauses.isEmpty()) {
                for (WhereClause whereClause : whereClauses) {
                    if (whereClause == null) {
                        continue;
                    }
                    String field = whereClause.field();
                    String operator = whereClause.operator();
                    if (field == null || field.isBlank() || operator == null || operator.isBlank()) {
                        continue;
                    }
                    query = applyWhere(query, field, operator, whereClause.value());
                }
            }

            if (orderField != null && !orderField.isBlank()) {
                Query.Direction direction = "asc".equalsIgnoreCase(orderDirection)
                        ? Query.Direction.ASCENDING
                        : Query.Direction.DESCENDING;
                if ("id".equalsIgnoreCase(orderField.trim())) {
                    query = query.orderBy(FieldPath.documentId(), direction);
                } else {
                    query = query.orderBy(orderField, direction);
                }
            }

            if (safePage > 0) {
                query = query.offset(safePage * safeLimit);
            }
            query = query.limit(safeLimit + 1);

            QuerySnapshot querySnapshot = query.get().get();
            List<QueryDocumentSnapshot> fetchedDocuments = querySnapshot.getDocuments();
            boolean hasNextPage = fetchedDocuments.size() > safeLimit;
            List<Map<String, Object>> documents = fetchedDocuments.stream()
                    .limit(safeLimit)
                    .map(this::toDocumentData)
                    .collect(Collectors.toList());

            long elapsedMs = Math.max(1L, (System.nanoTime() - startNanos) / 1_000_000L);
            return new QueryResult(documents, elapsedMs, safePage, safeLimit, hasNextPage);
        }).subscribeOn(Schedulers.boundedElastic());
    }

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
