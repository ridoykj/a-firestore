package com.itbd.afirestore.firestore.service;

import com.google.cloud.firestore.*;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import com.itbd.afirestore.firestore.dto.DeepCopyRequest;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class FirestoreTransferService {

    private final FirestoreManagerService firestoreManager;

    public FirestoreTransferService(FirestoreManagerService firestoreManager) {
        this.firestoreManager = firestoreManager;
    }

    public Mono<Map<String, Object>> performDeepCopy(DeepCopyRequest request) {
        return Mono.fromCallable(() -> {
            AtomicInteger totalCopied = new AtomicInteger(0);
            AtomicBoolean isFinished = new AtomicBoolean(false);
            AtomicReference<Throwable> errorRef = new AtomicReference<>(null);
            
            performDeepCopyAsync(request, totalCopied, isFinished, errorRef);
            
            // Wait for it to finish for the non-streaming endpoint
            while (!isFinished.get()) {
                Thread.sleep(100);
            }
            if (errorRef.get() != null) {
                throw new RuntimeException(errorRef.get());
            }
            
            return Map.of("success", (Object) true, "copiedDocuments", totalCopied.get());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    public void performDeepCopyAsync(DeepCopyRequest request, AtomicInteger totalCopied, AtomicBoolean isFinished, AtomicReference<Throwable> errorRef) {
        Thread.ofVirtual().start(() -> {
            try {
                Firestore source = firestoreManager.getFirestore(request.sourceProjectId(), request.sourceDatabaseId());
                Firestore target = firestoreManager.getFirestore(request.targetProjectId(), request.targetDatabaseId());
                String normalizedTargetBasePath = normalizePath(request.targetBasePath());

                SetOptions setOptions = "MERGE".equalsIgnoreCase(request.conflictResolution()) ? SetOptions.merge() : null;
                BatchManager batchManager = new BatchManager(target, totalCopied);
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

                try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
                    List<Callable<Void>> tasks = new ArrayList<>();
                    for (String path : normalizedSourcePaths) {
                        tasks.add(() -> {
                            if (isDocumentPath(path)) {
                                DocumentReference sourceDoc = source.document(path);
                                String resolvedTargetDocPath = resolveTargetDocumentPath(path, normalizedTargetBasePath);
                                ensureDocumentPath(resolvedTargetDocPath, path, normalizedTargetBasePath);
                                DocumentReference targetDoc = target.document(resolvedTargetDocPath);
                                copyDocumentRecursive(sourceDoc, targetDoc, setOptions, batchManager, executor);
                            } else if (isCollectionPath(path)) {
                                CollectionReference sourceCol = source.collection(path);
                                String resolvedTargetCollectionPath = resolveTargetCollectionPath(path, normalizedTargetBasePath);
                                ensureCollectionPath(resolvedTargetCollectionPath, path, normalizedTargetBasePath);
                                CollectionReference targetCol = target.collection(resolvedTargetCollectionPath);
                                copyCollectionRecursive(sourceCol, targetCol, setOptions, batchManager, executor);
                            } else {
                                throw new IllegalArgumentException("Invalid source path: " + path);
                            }
                            return null;
                        });
                    }
                    for (var future : executor.invokeAll(tasks)) {
                        future.get();
                    }
                }

                batchManager.commitAll(); // Ensure remaining operations are flushed
            } catch (Exception e) {
                errorRef.compareAndSet(null, e);
            } finally {
                isFinished.set(true);
            }
        });
    }

    /**
     * FFP-305: Runs a deep copy as a cancellable {@link JobRegistry.Job}. Unlike the fan-out
     * streaming copy, this walks the subtree sequentially so cancellation is prompt and committed
     * progress is accurate (counted on batch commit, not when queued). Source paths are
     * deduplicated. Re-running in MERGE mode is idempotent, which is how a cancelled job is
     * resumed; the job reports its committed checkpoint on cancel.
     */
    public void startDeepCopyJob(JobRegistry.Job job, DeepCopyRequest request) {
        Thread.ofVirtual().start(() -> {
            try {
                job.markRunning();
                Firestore source = firestoreManager.getFirestore(request.sourceProjectId(), request.sourceDatabaseId());
                Firestore target = firestoreManager.getFirestore(request.targetProjectId(), request.targetDatabaseId());
                String normalizedTargetBasePath = normalizePath(request.targetBasePath());
                SetOptions setOptions = "MERGE".equalsIgnoreCase(request.conflictResolution()) ? SetOptions.merge() : null;

                LinkedHashSet<String> normalizedSources = new LinkedHashSet<>();
                for (String rawPath : request.sourcePaths()) {
                    String normalized = normalizePath(rawPath);
                    if (!normalized.isEmpty()) {
                        normalizedSources.add(normalized);
                    }
                }
                if (normalizedSources.isEmpty()) {
                    throw new IllegalArgumentException("No valid source paths to copy.");
                }

                JobBatchManager batchManager = new JobBatchManager(target, job);
                for (String path : normalizedSources) {
                    if (job.isCancelRequested()) {
                        break;
                    }
                    if (isDocumentPath(path)) {
                        String resolved = resolveTargetDocumentPath(path, normalizedTargetBasePath);
                        ensureDocumentPath(resolved, path, normalizedTargetBasePath);
                        copyDocumentForJob(source.document(path), target.document(resolved), setOptions, batchManager, job);
                    } else if (isCollectionPath(path)) {
                        String resolved = resolveTargetCollectionPath(path, normalizedTargetBasePath);
                        ensureCollectionPath(resolved, path, normalizedTargetBasePath);
                        copyCollectionForJob(source.collection(path), target.collection(resolved), setOptions, batchManager, job);
                    } else {
                        job.recordFailure(path, "Invalid source path.");
                    }
                }
                batchManager.commitAll();

                if (job.isCancelRequested()) {
                    job.cancelFinished("Cancelled after " + job.committed() + " committed document(s).");
                } else {
                    job.complete("Copied " + job.committed() + " document(s); " + job.failedCount() + " failed.");
                }
            } catch (Exception jobFailure) {
                job.fail(jobFailure.getMessage() == null ? "Deep copy failed." : jobFailure.getMessage());
            }
        });
    }

    private void copyCollectionForJob(CollectionReference sourceCol, CollectionReference targetCol,
            SetOptions setOptions, JobBatchManager batchManager, JobRegistry.Job job) {
        for (DocumentReference docRef : sourceCol.listDocuments()) {
            if (job.isCancelRequested()) {
                return;
            }
            copyDocumentForJob(docRef, targetCol.document(docRef.getId()), setOptions, batchManager, job);
        }
    }

    private void copyDocumentForJob(DocumentReference sourceDoc, DocumentReference targetDoc,
            SetOptions setOptions, JobBatchManager batchManager, JobRegistry.Job job) {
        if (job.isCancelRequested()) {
            return;
        }
        try {
            DocumentSnapshot snap = sourceDoc.get().get();
            if (snap.exists() && snap.getData() != null) {
                batchManager.set(targetDoc, snap.getData(), setOptions);
            }
        } catch (Exception documentFailure) {
            job.recordFailure(sourceDoc.getPath(), documentFailure.getMessage());
        }
        try {
            for (CollectionReference subCol : sourceDoc.listCollections()) {
                if (job.isCancelRequested()) {
                    return;
                }
                copyCollectionForJob(subCol, targetDoc.collection(subCol.getId()), setOptions, batchManager, job);
            }
        } catch (Exception subcollectionFailure) {
            job.recordFailure(sourceDoc.getPath(), subcollectionFailure.getMessage());
        }
    }

    private void copyCollectionRecursive(CollectionReference sourceCol, CollectionReference targetCol, SetOptions setOptions, BatchManager batchManager, ExecutorService executor) throws Exception {
        List<Callable<Void>> tasks = new ArrayList<>();
        // Use stream() to avoid loading massive collections entirely into memory
        for (DocumentReference docRef : sourceCol.listDocuments()) {
            tasks.add(() -> {
                copyDocumentRecursive(docRef, targetCol.document(docRef.getId()), setOptions, batchManager, executor);
                return null;
            });
        }
        for (var future : executor.invokeAll(tasks)) {
            future.get();
        }
    }

    private void copyDocumentRecursive(DocumentReference sourceDoc, DocumentReference targetDoc, SetOptions setOptions, BatchManager batchManager, ExecutorService executor) throws Exception {
        DocumentSnapshot snap = sourceDoc.get().get();
        if (snap.exists() && snap.getData() != null) {
            batchManager.set(targetDoc, snap.getData(), setOptions);
        }

        List<Callable<Void>> tasks = new ArrayList<>();
        // Recursively copy sub-collections
        for (CollectionReference subCol : sourceDoc.listCollections()) {
            tasks.add(() -> {
                copyCollectionRecursive(subCol, targetDoc.collection(subCol.getId()), setOptions, batchManager, executor);
                return null;
            });
        }
        for (var future : executor.invokeAll(tasks)) {
            future.get();
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
        private final AtomicInteger totalCopied;

        public BatchManager(Firestore db, AtomicInteger totalCopied) {
            this.db = db;
            this.batch = db.batch();
            this.totalCopied = totalCopied;
        }

        public void set(DocumentReference ref, Map<String, Object> data, SetOptions setOptions) throws Exception {
            WriteBatch batchToCommit = null;
            synchronized (this) {
                if (setOptions != null) {
                    batch.set(ref, data, setOptions);
                } else {
                    batch.set(ref, data);
                }
                opCount++;
                totalCopied.incrementAndGet();

                if (opCount >= 500) {
                    batchToCommit = this.batch;
                    this.batch = db.batch();
                    this.opCount = 0;
                }
            }
            if (batchToCommit != null) {
                batchToCommit.commit().get();
            }
        }

        public void commitAll() throws Exception {
            WriteBatch batchToCommit = null;
            synchronized (this) {
                if (opCount > 0) {
                    batchToCommit = this.batch;
                    this.batch = db.batch();
                    this.opCount = 0;
                }
            }
            if (batchToCommit != null) {
                batchToCommit.commit().get();
            }
        }

        public int getTotalCopied() {
            return totalCopied.get();
        }
    }

    /**
     * FFP-305: Batch manager that increments a job's committed count only when a batch actually
     * commits, so progress reflects durable writes rather than queued operations.
     */
    private static class JobBatchManager {
        private final Firestore db;
        private final JobRegistry.Job job;
        private WriteBatch batch;
        private int opCount = 0;

        JobBatchManager(Firestore db, JobRegistry.Job job) {
            this.db = db;
            this.job = job;
            this.batch = db.batch();
        }

        void set(DocumentReference ref, Map<String, Object> data, SetOptions setOptions) throws Exception {
            if (setOptions != null) {
                batch.set(ref, data, setOptions);
            } else {
                batch.set(ref, data);
            }
            opCount += 1;
            if (opCount >= 400) {
                commitAll();
            }
        }

        void commitAll() throws Exception {
            if (opCount == 0) {
                return;
            }
            int committing = opCount;
            WriteBatch toCommit = this.batch;
            this.batch = db.batch();
            this.opCount = 0;
            toCommit.commit().get();
            job.addCommitted(committing);
        }
    }
}
