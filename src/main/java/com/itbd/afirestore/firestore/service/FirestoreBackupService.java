package com.itbd.afirestore.firestore.service;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import com.itbd.afirestore.firestore.support.FirestorePaths;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FFP-304: Restore of a typed backup artifact. Writes preserve native Firestore types (each field
 * is a canonical {@link FirestoreValue}), respect a conflict policy, and run as a cancellable
 * {@link JobRegistry.Job} that reports committed progress and per-document failures.
 */
@Slf4j
@Service
public class FirestoreBackupService {

    /** A single document to restore: absolute path + typed fields. */
    public record RestoreDoc(String path, Map<String, FirestoreValue> fields) {}

    private final FirestoreManagerService firestoreManager;

    public FirestoreBackupService(FirestoreManagerService firestoreManager) {
        this.firestoreManager = firestoreManager;
    }

    /**
     * Runs a restore on a virtual thread. Policies: MERGE (set with merge), OVERWRITE (replace),
     * SKIP (only write documents that do not already exist). A dry run writes nothing.
     */
    public void startRestore(
            JobRegistry.Job job,
            String projectId,
            String databaseId,
            List<RestoreDoc> documents,
            String conflictPolicy,
            boolean dryRun) {
        Thread.ofVirtual().start(() -> {
            try {
                job.markRunning();
                job.setTotal(documents.size());

                String policy = normalizePolicy(conflictPolicy);
                if (dryRun) {
                    job.complete("Dry run: " + documents.size()
                            + " document(s) would be restored with policy " + policy + ".");
                    return;
                }

                Firestore firestore = firestoreManager.getFirestore(projectId, databaseId);
                boolean merge = "MERGE".equals(policy);
                boolean skip = "SKIP".equals(policy);

                for (RestoreDoc document : documents) {
                    if (job.isCancelRequested()) {
                        job.cancelFinished("Cancelled after " + job.committed() + " document(s).");
                        return;
                    }
                    String path = FirestorePaths.normalize(document.path());
                    if (!FirestorePaths.isDocument(path)) {
                        job.recordFailure(document.path(), "Not a valid document path.");
                        continue;
                    }
                    try {
                        DocumentReference ref = firestore.document(path);
                        if (skip && ref.get().get().exists()) {
                            continue; // Existing document left untouched; not counted as committed.
                        }
                        Map<String, Object> raw = toRawFields(firestore, document.fields());
                        if (merge) {
                            ref.set(raw, SetOptions.merge()).get();
                        } else {
                            ref.set(raw).get();
                        }
                        job.incrementCommitted();
                    } catch (Exception documentFailure) {
                        job.recordFailure(path, documentFailure.getMessage());
                    }
                }

                job.complete("Restore complete: " + job.committed() + " written, "
                        + job.failedCount() + " failed.");
            } catch (Exception jobFailure) {
                log.error("Restore job {} failed: {}", job.id(), jobFailure.getMessage(), jobFailure);
                job.fail(jobFailure.getMessage() == null ? "Restore failed." : jobFailure.getMessage());
            }
        });
    }

    private static Map<String, Object> toRawFields(Firestore firestore, Map<String, FirestoreValue> fields) {
        Map<String, Object> raw = new LinkedHashMap<>();
        if (fields != null) {
            fields.forEach((key, value) ->
                    raw.put(key, value == null ? null : value.toFirestoreObject(firestore)));
        }
        return raw;
    }

    private static String normalizePolicy(String conflictPolicy) {
        if (conflictPolicy == null) {
            return "MERGE";
        }
        return switch (conflictPolicy.trim().toUpperCase()) {
            case "OVERWRITE" -> "OVERWRITE";
            case "SKIP" -> "SKIP";
            default -> "MERGE";
        };
    }
}
