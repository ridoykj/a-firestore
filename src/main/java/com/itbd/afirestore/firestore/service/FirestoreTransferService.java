package com.itbd.afirestore.firestore.service;

import com.google.cloud.firestore.*;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import com.itbd.afirestore.firestore.dto.DeepCopyRequest;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class FirestoreTransferService {

    private final FirestoreManagerService firestoreManager;

    public FirestoreTransferService(FirestoreManagerService firestoreManager) {
        this.firestoreManager = firestoreManager;
    }

    public Mono<Map<String, Object>> performDeepCopy(DeepCopyRequest request) {
        return Mono.fromCallable(() -> {
            Firestore source = firestoreManager.getFirestore(request.sourceProjectId(), request.sourceDatabaseId());
            Firestore target = firestoreManager.getFirestore(request.targetProjectId(), request.targetDatabaseId());
            String normalizedTargetBasePath = normalizePath(request.targetBasePath());

            SetOptions setOptions = "MERGE".equalsIgnoreCase(request.conflictResolution()) ? SetOptions.merge() : null;
            BatchManager batchManager = new BatchManager(target);
            List<String> normalizedSourcePaths = new ArrayList<>();
            List<String> invalidSourcePaths = new ArrayList<>();

            for (String rawPath : request.sourcePaths()) {
                String normalizedPath = normalizePath(rawPath);
                if (normalizedPath.isEmpty()) {
                    invalidSourcePaths.add(rawPath == null ? "null" : rawPath);
                    continue;
                }
                normalizedSourcePaths.add(normalizedPath);
            }

            if (!invalidSourcePaths.isEmpty()) {
                throw new IllegalArgumentException("Invalid source path(s): " + invalidSourcePaths);
            }

            for (String path : normalizedSourcePaths) {
                if (isDocumentPath(path)) {
                    DocumentReference sourceDoc = source.document(path);
                    String resolvedTargetDocPath = resolveTargetDocumentPath(path, normalizedTargetBasePath);
                    ensureDocumentPath(resolvedTargetDocPath, path, normalizedTargetBasePath);
                    DocumentReference targetDoc = target.document(resolvedTargetDocPath);
                    copyDocumentRecursive(sourceDoc, targetDoc, setOptions, batchManager);
                } else if (isCollectionPath(path)) {
                    CollectionReference sourceCol = source.collection(path);
                    String resolvedTargetCollectionPath = resolveTargetCollectionPath(path, normalizedTargetBasePath);
                    ensureCollectionPath(resolvedTargetCollectionPath, path, normalizedTargetBasePath);
                    CollectionReference targetCol = target.collection(resolvedTargetCollectionPath);
                    copyCollectionRecursive(sourceCol, targetCol, setOptions, batchManager);
                } else {
                    throw new IllegalArgumentException("Invalid source path: " + path);
                }
            }

            batchManager.commitAll(); // Ensure remaining operations are flushed
            return Map.of("success", (Object) true, "copiedDocuments", batchManager.getTotalCopied());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private void copyCollectionRecursive(CollectionReference sourceCol, CollectionReference targetCol, SetOptions setOptions, BatchManager batchManager) throws Exception {
        // Use stream() to avoid loading massive collections entirely into memory
        for (DocumentReference docRef : sourceCol.listDocuments()) {
            copyDocumentRecursive(docRef, targetCol.document(docRef.getId()), setOptions, batchManager);
        }
    }

    private void copyDocumentRecursive(DocumentReference sourceDoc, DocumentReference targetDoc, SetOptions setOptions, BatchManager batchManager) throws Exception {
        DocumentSnapshot snap = sourceDoc.get().get();
        if (snap.exists() && snap.getData() != null) {
            batchManager.set(targetDoc, snap.getData(), setOptions);
        }

        // Recursively copy sub-collections
        for (CollectionReference subCol : sourceDoc.listCollections()) {
            copyCollectionRecursive(subCol, targetDoc.collection(subCol.getId()), setOptions, batchManager);
        }
    }

    private String resolveTargetDocumentPath(String sourceDocumentPath, String normalizedTargetBasePath) {
        String sourceDocId = lastSegment(sourceDocumentPath);
        if (normalizedTargetBasePath.isEmpty()) {
            return sourceDocumentPath;
        }
        if (isDocumentPath(normalizedTargetBasePath)) {
            return normalizedTargetBasePath;
        }
        if (isCollectionPath(normalizedTargetBasePath)) {
            return normalizedTargetBasePath + "/" + sourceDocId;
        }
        throw new IllegalArgumentException(
                "Unable to resolve document destination for sourcePath='" + sourceDocumentPath
                        + "', targetBasePath='" + normalizedTargetBasePath + "'");
    }

    private String resolveTargetCollectionPath(String sourceCollectionPath, String normalizedTargetBasePath) {
        String sourceCollectionId = lastSegment(sourceCollectionPath);
        if (normalizedTargetBasePath.isEmpty()) {
            return sourceCollectionPath;
        }
        if (isDocumentPath(normalizedTargetBasePath)) {
            return normalizedTargetBasePath + "/" + sourceCollectionId;
        }
        if (isCollectionPath(normalizedTargetBasePath)) {
            return normalizedTargetBasePath + "/" + sourceCollectionId;
        }
        throw new IllegalArgumentException(
                "Unable to resolve collection destination for sourcePath='" + sourceCollectionPath
                        + "', targetBasePath='" + normalizedTargetBasePath + "'");
    }

    private void ensureDocumentPath(String candidatePath, String sourcePath, String normalizedTargetBasePath) {
        if (!isDocumentPath(candidatePath)) {
            throw new IllegalArgumentException(
                    "Resolved target is not a valid document path. sourcePath='" + sourcePath
                            + "', targetBasePath='" + normalizedTargetBasePath
                            + "', resolvedPath='" + candidatePath + "'");
        }
    }

    private void ensureCollectionPath(String candidatePath, String sourcePath, String normalizedTargetBasePath) {
        if (!isCollectionPath(candidatePath)) {
            throw new IllegalArgumentException(
                    "Resolved target is not a valid collection path. sourcePath='" + sourcePath
                            + "', targetBasePath='" + normalizedTargetBasePath
                            + "', resolvedPath='" + candidatePath + "'");
        }
    }

    private String normalizePath(String rawPath) {
        if (rawPath == null) {
            return "";
        }

        String trimmed = rawPath.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        String[] pieces = trimmed.split("/");
        List<String> normalizedSegments = new ArrayList<>();
        for (String piece : pieces) {
            String segment = piece == null ? "" : piece.trim();
            if (!segment.isEmpty()) {
                normalizedSegments.add(segment);
            }
        }

        return String.join("/", normalizedSegments);
    }

    private boolean isDocumentPath(String normalizedPath) {
        if (normalizedPath == null || normalizedPath.isBlank()) {
            return false;
        }
        return normalizedPath.split("/").length % 2 == 0;
    }

    private boolean isCollectionPath(String normalizedPath) {
        if (normalizedPath == null || normalizedPath.isBlank()) {
            return false;
        }
        return normalizedPath.split("/").length % 2 != 0;
    }

    private String lastSegment(String normalizedPath) {
        String[] segments = normalizedPath.split("/");
        return segments[segments.length - 1];
    }

    /**
     * Helper class to manage Firestore WriteBatch limits (max 500 ops)
     */
    private static class BatchManager {
        private final Firestore db;
        private WriteBatch batch;
        private int opCount = 0;
        private final AtomicInteger totalCopied = new AtomicInteger(0);

        public BatchManager(Firestore db) {
            this.db = db;
            this.batch = db.batch();
        }

        public void set(DocumentReference ref, Map<String, Object> data, SetOptions setOptions) throws Exception {
            if (setOptions != null) {
                batch.set(ref, data, setOptions);
            } else {
                batch.set(ref, data);
            }
            opCount++;
            totalCopied.incrementAndGet();

            if (opCount >= 500) {
                commitAll();
            }
        }

        public void commitAll() throws Exception {
            if (opCount > 0) {
                batch.commit().get();
                batch = db.batch();
                opCount = 0;
            }
        }

        public int getTotalCopied() {
            return totalCopied.get();
        }
    }
}
