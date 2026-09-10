package com.itbd.afirestore.firestore.service;

import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.google.cloud.firestore.WriteBatch;
import com.itbd.afirestore.firestore.dto.DeepCopyRequest;
import com.itbd.afirestore.firestore.support.FirestorePaths;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * FFP-305/DUP-002: Deep copy between two Firestore connections.
 *
 * <p>There is one copy engine ({@link #copySources}) behind two entry points — the SSE stream and
 * the cancellable job. They used to be separate implementations (four methods and a batch manager
 * each) that had already drifted: only the job path could be cancelled, only the job path recorded
 * per-path failures, only the SSE path fanned out across virtual threads, and the two disagreed on
 * whether an invalid path aborted the copy. Both entry points now differ only in their
 * {@link CopyProgressSink}, so a fix lands once.</p>
 */
@Service
public class FirestoreTransferService {

    /** Firestore caps a batch at 500 writes; commit below that so a retry has headroom. */
    private static final int BATCH_COMMIT_THRESHOLD = 400;

    private final FirestoreManagerService firestoreManager;

    public FirestoreTransferService(FirestoreManagerService firestoreManager) {
        this.firestoreManager = firestoreManager;
    }

    /**
     * DUP-002: Where a running copy reports progress and asks whether it should stop. The engine
     * consults {@link #isCancelled()} before every document, so cancellation is prompt on both
     * entry points.
     */
    public interface CopyProgressSink {

        /** Called once per committed batch, with the number of documents that batch durably wrote. */
        void onCommitted(int documents);

        /** Called for a path that could not be copied; the copy continues with the next path. */
        void onFailure(String path, String reason);

        /** True once the caller has asked for the copy to stop. */
        boolean isCancelled();
    }

    /**
     * FFP-305: Runs a deep copy as a cancellable {@link JobRegistry.Job}. Re-running in MERGE mode
     * is idempotent, which is how a cancelled job is resumed; the job reports its committed
     * checkpoint on cancel.
     */
    public void startDeepCopyJob(JobRegistry.Job job, DeepCopyRequest request) {
        Thread.ofVirtual().start(() -> {
            try {
                job.markRunning();
                copySources(request, new JobProgressSink(job));

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

    /**
     * Runs a deep copy in the background for the SSE endpoint, reporting committed documents through
     * {@code totalCopied}. Per-path failures are summarized into {@code errorRef} once the copy
     * finishes, so a bad source path is reported rather than silently skipped.
     */
    public void performDeepCopyAsync(
            DeepCopyRequest request,
            AtomicInteger totalCopied,
            AtomicBoolean isFinished,
            AtomicReference<Throwable> errorRef) {
        Thread.ofVirtual().start(() -> {
            CollectingProgressSink sink = new CollectingProgressSink(totalCopied);
            try {
                copySources(request, sink);
                if (sink.hasFailures()) {
                    errorRef.compareAndSet(null, new IllegalArgumentException(sink.describeFailures()));
                }
            } catch (Exception copyFailure) {
                errorRef.compareAndSet(null, copyFailure);
            } finally {
                isFinished.set(true);
            }
        });
    }

    /**
     * DUP-002: The one copy engine. Resolves both clients, normalizes and dedupes the source paths,
     * then walks each subtree concurrently on virtual threads, batching writes.
     */
    private void copySources(DeepCopyRequest request, CopyProgressSink sink) throws Exception {
        Firestore source = firestoreManager.getFirestore(request.sourceProjectId(), request.sourceDatabaseId());
        Firestore target = firestoreManager.getFirestore(request.targetProjectId(), request.targetDatabaseId());
        String targetBasePath = FirestorePaths.normalize(request.targetBasePath());
        SetOptions setOptions = "MERGE".equalsIgnoreCase(request.conflictResolution())
                ? SetOptions.merge()
                : null;

        LinkedHashSet<String> sourcePaths = new LinkedHashSet<>();
        if (request.sourcePaths() != null) {
            for (String rawPath : request.sourcePaths()) {
                String normalized = FirestorePaths.normalize(rawPath);
                if (!normalized.isEmpty()) {
                    sourcePaths.add(normalized);
                }
            }
        }
        if (sourcePaths.isEmpty()) {
            throw new IllegalArgumentException("No valid source paths to copy.");
        }

        CopyBatch batch = new CopyBatch(target, sink);
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Callable<Void>> tasks = new ArrayList<>();
            for (String path : sourcePaths) {
                tasks.add(() -> {
                    copySource(source, target, path, targetBasePath, setOptions, batch, sink, executor);
                    return null;
                });
            }
            awaitAll(executor, tasks);
        }
        batch.commitAll();
    }

    /**
     * Dispatches one requested path to the document or collection walker. A path that cannot be
     * resolved is recorded as a failure rather than aborting the whole copy, so one bad selection
     * does not discard the rest.
     */
    private void copySource(
            Firestore source,
            Firestore target,
            String path,
            String targetBasePath,
            SetOptions setOptions,
            CopyBatch batch,
            CopyProgressSink sink,
            ExecutorService executor) {
        if (sink.isCancelled()) {
            return;
        }
        try {
            if (FirestorePaths.isDocument(path)) {
                String resolved = resolveTargetDocumentPath(path, targetBasePath);
                ensureDocumentPath(resolved, path, targetBasePath);
                copyDocument(source.document(path), target.document(resolved), setOptions, batch, sink, executor);
            } else if (FirestorePaths.isCollection(path)) {
                String resolved = resolveTargetCollectionPath(path, targetBasePath);
                ensureCollectionPath(resolved, path, targetBasePath);
                copyCollection(source.collection(path), target.collection(resolved), setOptions, batch, sink, executor);
            } else {
                sink.onFailure(path, "Invalid source path.");
            }
        } catch (Exception sourceFailure) {
            sink.onFailure(path, reasonOf(sourceFailure));
        }
    }

    private void copyCollection(
            CollectionReference sourceCollection,
            CollectionReference targetCollection,
            SetOptions setOptions,
            CopyBatch batch,
            CopyProgressSink sink,
            ExecutorService executor) throws Exception {
        List<Callable<Void>> tasks = new ArrayList<>();
        for (DocumentReference documentRef : sourceCollection.listDocuments()) {
            if (sink.isCancelled()) {
                break;
            }
            tasks.add(() -> {
                copyDocument(documentRef, targetCollection.document(documentRef.getId()),
                        setOptions, batch, sink, executor);
                return null;
            });
        }
        awaitAll(executor, tasks);
    }

    private void copyDocument(
            DocumentReference sourceDoc,
            DocumentReference targetDoc,
            SetOptions setOptions,
            CopyBatch batch,
            CopyProgressSink sink,
            ExecutorService executor) throws Exception {
        if (sink.isCancelled()) {
            return;
        }
        try {
            DocumentSnapshot snapshot = sourceDoc.get().get();
            if (snapshot.exists() && snapshot.getData() != null) {
                batch.set(targetDoc, snapshot.getData(), setOptions);
            }
        } catch (Exception documentFailure) {
            sink.onFailure(sourceDoc.getPath(), reasonOf(documentFailure));
        }

        List<Callable<Void>> tasks = new ArrayList<>();
        for (CollectionReference subCollection : sourceDoc.listCollections()) {
            if (sink.isCancelled()) {
                break;
            }
            tasks.add(() -> {
                copyCollection(subCollection, targetDoc.collection(subCollection.getId()),
                        setOptions, batch, sink, executor);
                return null;
            });
        }
        awaitAll(executor, tasks);
    }

    /** Runs every task and propagates the first failure, so no subtree is silently abandoned. */
    private static void awaitAll(ExecutorService executor, List<Callable<Void>> tasks) throws Exception {
        if (tasks.isEmpty()) {
            return;
        }
        for (Future<Void> future : executor.invokeAll(tasks)) {
            future.get();
        }
    }

    private static String reasonOf(Throwable error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private String resolveTargetDocumentPath(String sourceDocumentPath, String normalizedTargetBasePath) {
        if (normalizedTargetBasePath.isEmpty()) {
            return sourceDocumentPath;
        }
        if (FirestorePaths.isDocument(normalizedTargetBasePath)) {
            return normalizedTargetBasePath;
        }
        if (FirestorePaths.isCollection(normalizedTargetBasePath)) {
            return normalizedTargetBasePath + "/" + FirestorePaths.lastSegment(sourceDocumentPath);
        }
        throw new IllegalArgumentException(
                "Unable to resolve document destination for sourcePath='" + sourceDocumentPath
                        + "', targetBasePath='" + normalizedTargetBasePath + "'");
    }

    private String resolveTargetCollectionPath(String sourceCollectionPath, String normalizedTargetBasePath) {
        if (normalizedTargetBasePath.isEmpty()) {
            return sourceCollectionPath;
        }
        // A collection is always nested under the base path, whether that names a document or a
        // collection; only the parity check below differs.
        if (FirestorePaths.isDocument(normalizedTargetBasePath)
                || FirestorePaths.isCollection(normalizedTargetBasePath)) {
            return normalizedTargetBasePath + "/" + FirestorePaths.lastSegment(sourceCollectionPath);
        }
        throw new IllegalArgumentException(
                "Unable to resolve collection destination for sourcePath='" + sourceCollectionPath
                        + "', targetBasePath='" + normalizedTargetBasePath + "'");
    }

    private void ensureDocumentPath(String candidatePath, String sourcePath, String normalizedTargetBasePath) {
        if (!FirestorePaths.isDocument(candidatePath)) {
            throw new IllegalArgumentException(
                    "Resolved target is not a valid document path. sourcePath='" + sourcePath
                            + "', targetBasePath='" + normalizedTargetBasePath
                            + "', resolvedPath='" + candidatePath + "'");
        }
    }

    private void ensureCollectionPath(String candidatePath, String sourcePath, String normalizedTargetBasePath) {
        if (!FirestorePaths.isCollection(candidatePath)) {
            throw new IllegalArgumentException(
                    "Resolved target is not a valid collection path. sourcePath='" + sourcePath
                            + "', targetBasePath='" + normalizedTargetBasePath
                            + "', resolvedPath='" + candidatePath + "'");
        }
    }

    /**
     * DUP-002: The one batch manager. Writes are queued under a lock and committed outside it;
     * progress is reported only after a batch durably commits, so a cancelled copy's committed count
     * is a real checkpoint rather than a queue depth.
     */
    private static final class CopyBatch {

        private final Firestore target;
        private final CopyProgressSink sink;
        private WriteBatch batch;
        private int queued;

        CopyBatch(Firestore target, CopyProgressSink sink) {
            this.target = target;
            this.sink = sink;
            this.batch = target.batch();
        }

        void set(DocumentReference ref, Map<String, Object> data, SetOptions setOptions) throws Exception {
            WriteBatch ready = null;
            int readyCount = 0;
            synchronized (this) {
                if (setOptions != null) {
                    batch.set(ref, data, setOptions);
                } else {
                    batch.set(ref, data);
                }
                queued += 1;
                if (queued >= BATCH_COMMIT_THRESHOLD) {
                    ready = batch;
                    readyCount = queued;
                    batch = target.batch();
                    queued = 0;
                }
            }
            commit(ready, readyCount);
        }

        void commitAll() throws Exception {
            WriteBatch ready;
            int readyCount;
            synchronized (this) {
                if (queued == 0) {
                    return;
                }
                ready = batch;
                readyCount = queued;
                batch = target.batch();
                queued = 0;
            }
            commit(ready, readyCount);
        }

        private void commit(WriteBatch ready, int readyCount) throws Exception {
            if (ready == null) {
                return;
            }
            ready.commit().get();
            sink.onCommitted(readyCount);
        }
    }

    /** FFP-305: reports into a {@link JobRegistry.Job} and honours its cancel flag. */
    private record JobProgressSink(JobRegistry.Job job) implements CopyProgressSink {

        @Override
        public void onCommitted(int documents) {
            job.addCommitted(documents);
        }

        @Override
        public void onFailure(String path, String reason) {
            job.recordFailure(path, reason);
        }

        @Override
        public boolean isCancelled() {
            return job.isCancelRequested();
        }
    }

    /**
     * Reports into the counter the SSE endpoint polls, collecting failures so they can be summarized
     * for a client that has no job to inspect. That stream has no cancel channel, so
     * {@link #isCancelled()} is always false.
     */
    private static final class CollectingProgressSink implements CopyProgressSink {

        private static final int MAX_REPORTED_FAILURES = 20;

        private final AtomicInteger totalCopied;
        private final List<String> failures = Collections.synchronizedList(new ArrayList<>());

        CollectingProgressSink(AtomicInteger totalCopied) {
            this.totalCopied = totalCopied;
        }

        @Override
        public void onCommitted(int documents) {
            totalCopied.addAndGet(documents);
        }

        @Override
        public void onFailure(String path, String reason) {
            failures.add(path + ": " + reason);
        }

        @Override
        public boolean isCancelled() {
            return false;
        }

        boolean hasFailures() {
            return !failures.isEmpty();
        }

        String describeFailures() {
            synchronized (failures) {
                int total = failures.size();
                List<String> reported = failures.subList(0, Math.min(total, MAX_REPORTED_FAILURES));
                String summary = String.join("; ", reported);
                return total > MAX_REPORTED_FAILURES
                        ? total + " path(s) failed: " + summary + "; …"
                        : total + " path(s) failed: " + summary;
            }
        }
    }
}
