package com.itbd.afirestore.firestore.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * FFP-304/FFP-305: In-memory registry for long-running, cancellable jobs (deep copy, restore).
 *
 * <p>Jobs track committed progress (not merely queued work), a cancellation flag checked
 * cooperatively by workers, and a bounded list of per-item failures for downloadable reports.
 * State is process-local, which suits the single-user local tool. Progress is observed by polling
 * a {@link Job} snapshot (the SSE endpoints poll every 500ms), matching the existing transfer
 * streaming approach.</p>
 */
@Slf4j
@Service
public class JobRegistry {

    /** A job runs through pending → running → (completed | failed | cancelled). */
    public enum Status { PENDING, RUNNING, COMPLETED, FAILED, CANCELLED }

    /** Cap on retained failure entries so a runaway job cannot exhaust memory. */
    public static final int MAX_FAILURES = 1000;

    public static final class Job {
        private final String id;
        private final String type;
        private final Instant createdAt;
        private volatile Status status = Status.PENDING;
        private volatile String message = "";
        private volatile Instant finishedAt;
        private final AtomicInteger committed = new AtomicInteger(0);
        private final AtomicInteger failedCount = new AtomicInteger(0);
        // -1 means the total is unknown (streaming discovery).
        private final AtomicInteger total = new AtomicInteger(-1);
        private final AtomicBoolean cancelRequested = new AtomicBoolean(false);
        private final List<Map<String, Object>> failures = Collections.synchronizedList(new ArrayList<>());

        private Job(String id, String type, Instant createdAt) {
            this.id = id;
            this.type = type;
            this.createdAt = createdAt;
        }

        public String id() { return id; }
        public String type() { return type; }
        public Status status() { return status; }
        public String message() { return message; }
        public int committed() { return committed.get(); }
        public int failedCount() { return failedCount.get(); }
        public int total() { return total.get(); }
        public boolean isCancelRequested() { return cancelRequested.get(); }
        public boolean isTerminal() {
            return status == Status.COMPLETED || status == Status.FAILED || status == Status.CANCELLED;
        }

        public void markRunning() { this.status = Status.RUNNING; }
        public void requestCancel() { this.cancelRequested.set(true); }
        public void setTotal(int value) { this.total.set(value); }
        public int addCommitted(int delta) { return this.committed.addAndGet(delta); }
        public void incrementCommitted() { this.committed.incrementAndGet(); }

        public void recordFailure(String path, String reason) {
            failedCount.incrementAndGet();
            if (failures.size() < MAX_FAILURES) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("path", path);
                entry.put("reason", reason == null ? "" : reason);
                failures.add(entry);
            }
        }

        public List<Map<String, Object>> failures() {
            synchronized (failures) {
                return List.copyOf(failures);
            }
        }

        public void complete(String message) {
            this.message = message == null ? "" : message;
            this.status = this.cancelRequested.get() ? Status.CANCELLED : Status.COMPLETED;
            this.finishedAt = Instant.now();
        }

        public void fail(String message) {
            this.message = message == null ? "" : message;
            this.status = Status.FAILED;
            this.finishedAt = Instant.now();
        }

        public void cancelFinished(String message) {
            this.message = message == null ? "" : message;
            this.status = Status.CANCELLED;
            this.finishedAt = Instant.now();
        }

        /** A snapshot for status/progress responses. */
        public Map<String, Object> snapshot() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("jobId", id);
            map.put("type", type);
            map.put("status", status.name().toLowerCase());
            map.put("committed", committed.get());
            map.put("failed", failedCount.get());
            map.put("total", total.get());
            map.put("cancelRequested", cancelRequested.get());
            map.put("message", message);
            map.put("createdAt", createdAt.toString());
            map.put("finishedAt", finishedAt == null ? null : finishedAt.toString());
            return map;
        }
    }

    private final Map<String, Job> jobs = new ConcurrentHashMap<>();

    public Job create(String type) {
        // UUID.randomUUID is allowed here (runtime service, not a workflow script).
        Job job = new Job(UUID.randomUUID().toString(), type, Instant.now());
        jobs.put(job.id(), job);
        return job;
    }

    public Job get(String id) {
        return jobs.get(id);
    }

    public boolean requestCancel(String id) {
        Job job = jobs.get(id);
        if (job == null) {
            return false;
        }
        job.requestCancel();
        return true;
    }

    @PreDestroy
    public void shutdown() {
        // Signal any in-flight jobs to stop cooperatively on application shutdown.
        jobs.values().forEach(Job::requestCancel);
        jobs.clear();
    }
}
