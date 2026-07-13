package com.itbd.afirestore.firestore.service;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FFP-304/FFP-305: Job lifecycle, committed progress, cancellation, and bounded failure reports.
 */
class JobRegistryTest {

    private final JobRegistry registry = new JobRegistry();

    @Test
    void createdJobStartsPendingAndIsRetrievable() {
        JobRegistry.Job job = registry.create("deep-copy");
        assertThat(job.status()).isEqualTo(JobRegistry.Status.PENDING);
        assertThat(registry.get(job.id())).isSameAs(job);
        assertThat(job.committed()).isZero();
    }

    @Test
    void committedProgressAndCompletion() {
        JobRegistry.Job job = registry.create("deep-copy");
        job.markRunning();
        assertThat(job.status()).isEqualTo(JobRegistry.Status.RUNNING);
        job.addCommitted(400);
        job.incrementCommitted();
        assertThat(job.committed()).isEqualTo(401);
        job.complete("done");
        assertThat(job.status()).isEqualTo(JobRegistry.Status.COMPLETED);
        assertThat(job.isTerminal()).isTrue();
    }

    @Test
    void cancelBeforeCompleteYieldsCancelledStatus() {
        JobRegistry.Job job = registry.create("restore");
        job.markRunning();
        assertThat(registry.requestCancel(job.id())).isTrue();
        assertThat(job.isCancelRequested()).isTrue();
        // complete() honors a pending cancel request.
        job.complete("stopped");
        assertThat(job.status()).isEqualTo(JobRegistry.Status.CANCELLED);
    }

    @Test
    void failuresAreRecordedAndBounded() {
        JobRegistry.Job job = registry.create("restore");
        for (int i = 0; i < JobRegistry.MAX_FAILURES + 50; i += 1) {
            job.recordFailure("users/doc-" + i, "boom");
        }
        assertThat(job.failedCount()).isEqualTo(JobRegistry.MAX_FAILURES + 50);
        // The retained failure list is capped even though the counter keeps counting.
        assertThat(job.failures()).hasSize(JobRegistry.MAX_FAILURES);
        assertThat(job.failures().get(0)).containsEntry("reason", "boom");
    }

    @Test
    void snapshotReflectsState() {
        JobRegistry.Job job = registry.create("deep-copy");
        job.markRunning();
        job.addCommitted(3);
        Map<String, Object> snapshot = job.snapshot();
        assertThat(snapshot).containsEntry("type", "deep-copy")
                .containsEntry("status", "running")
                .containsEntry("committed", 3);
    }

    @Test
    void requestCancelOnUnknownJobIsFalse() {
        assertThat(registry.requestCancel("nope")).isFalse();
    }
}
