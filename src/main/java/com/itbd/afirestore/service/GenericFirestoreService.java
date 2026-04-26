package com.itbd.afirestore.service;

import com.google.api.core.ApiFuture;
import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldPath;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.SetOptions;
import com.google.cloud.firestore.WriteResult;
import com.google.cloud.firestore.v1.FirestoreAdminClient;
import com.google.cloud.firestore.v1.FirestoreAdminSettings;
import com.google.firestore.admin.v1.Database;
import com.itbd.afirestore.FirestoreManagerService;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
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

    private final FirestoreManagerService firestoreManagerService;

    public GenericFirestoreService(FirestoreManagerService firestoreManagerService) {
        this.firestoreManagerService = firestoreManagerService;
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

    public Mono<List<String>> getAllCollections() {
        return Mono.fromCallable(() -> {
            Iterable<CollectionReference> collections = firestoreManagerService.getFirestore().listCollections();
            return StreamSupport.stream(collections.spliterator(), false)
                    .map(CollectionReference::getId)
                    .collect(Collectors.toList());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public Mono<Map<String, Object>> createDocument(String collectionPath, Map<String, Object> data) {
        return Mono.fromCallable(() -> {
            DocumentReference docRef;
            Map<String, Object> mutable = new HashMap<>(data);
            if (mutable.containsKey("id") && mutable.get("id") != null) {
                docRef = firestoreManagerService.getFirestore().collection(collectionPath).document(mutable.get("id").toString());
            } else {
                docRef = firestoreManagerService.getFirestore().collection(collectionPath).document();
                mutable.put("id", docRef.getId());
            }
            ApiFuture<WriteResult> result = docRef.set(mutable);
            result.get();
            return mutable;
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

    public Mono<String> deleteDocument(String documentPath) {
        return Mono.fromCallable(() -> {
            firestoreManagerService.getFirestore().document(documentPath).delete().get();
            return documentPath.contains("/") ? documentPath.substring(documentPath.lastIndexOf('/') + 1) : documentPath;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private Query applyWhere(Query query, String field, String operator, Object value) {
        return switch (operator.trim()) {
            case "==" -> query.whereEqualTo(field, value);
            case "!=" -> query.whereNotEqualTo(field, value);
            case ">" -> query.whereGreaterThan(field, value);
            case ">=" -> query.whereGreaterThanOrEqualTo(field, value);
            case "<" -> query.whereLessThan(field, value);
            case "<=" -> query.whereLessThanOrEqualTo(field, value);
            default -> throw new IllegalArgumentException("Unsupported where operator: " + operator);
        };
    }

    private Map<String, Object> toDocumentData(DocumentSnapshot doc) {
        Map<String, Object> data = new LinkedHashMap<>(doc.getData() == null ? Map.of() : doc.getData());
        data.put("id", doc.getId());
        data.put("_path", doc.getReference().getPath());
        return data;
    }
}
