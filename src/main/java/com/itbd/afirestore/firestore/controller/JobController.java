package com.itbd.afirestore.firestore.controller;

import com.itbd.afirestore.firestore.dto.DeepCopyRequest;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import com.itbd.afirestore.firestore.service.FirestoreBackupService;
import com.itbd.afirestore.firestore.service.FirestoreTransferService;
import com.itbd.afirestore.firestore.service.JobRegistry;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FFP-304/FFP-305: Durable, cancellable jobs (deep copy, restore). Jobs are created, streamed
 * (SSE progress), cancelled, and their failure reports downloaded. Progress reflects committed
 * documents.
 */
@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobRegistry jobRegistry;
    private final FirestoreTransferService transferService;
    private final FirestoreBackupService backupService;

    public JobController(JobRegistry jobRegistry,
                         FirestoreTransferService transferService,
                         FirestoreBackupService backupService) {
        this.jobRegistry = jobRegistry;
        this.transferService = transferService;
        this.backupService = backupService;
    }

    /** FFP-305: Start a deep-copy job; returns its id for status/events/cancel. */
    @PostMapping("/deep-copy")
    public ResponseEntity<Map<String, Object>> startDeepCopy(@RequestBody DeepCopyRequest request) {
        if (request == null || request.sourcePaths() == null || request.sourcePaths().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "sourcePaths cannot be empty."));
        }
        JobRegistry.Job job = jobRegistry.create("deep-copy");
        transferService.startDeepCopyJob(job, request);
        return ResponseEntity.ok(Map.of("jobId", job.id(), "status", "pending"));
    }

    /** FFP-304: Start a restore job from a typed backup artifact. */
    @PostMapping("/restore")
    public ResponseEntity<Map<String, Object>> startRestore(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody RestoreRequest request) {
        if (request == null || request.documents() == null || request.documents().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "documents cannot be empty."));
        }
        JobRegistry.Job job = jobRegistry.create("restore");
        backupService.startRestore(
                job,
                projectId,
                normalizeDatabaseId(databaseId),
                request.documents(),
                request.conflictPolicy(),
                request.dryRun());
        return ResponseEntity.ok(Map.of("jobId", job.id(), "status", "pending"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Object> status(@PathVariable String id) {
        JobRegistry.Job job = jobRegistry.get(id);
        if (job == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(job.snapshot());
    }

    @GetMapping("/{id}/report")
    public ResponseEntity<Object> report(@PathVariable String id) {
        JobRegistry.Job job = jobRegistry.get(id);
        if (job == null) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", id);
        body.put("committed", job.committed());
        body.put("failed", job.failedCount());
        body.put("failures", job.failures());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<Object> cancel(@PathVariable String id) {
        JobRegistry.Job job = jobRegistry.get(id);
        if (job == null) {
            return ResponseEntity.notFound().build();
        }
        job.requestCancel();
        return ResponseEntity.ok(job.snapshot());
    }

    /** Polls the job every 500ms and streams progress snapshots until it reaches a terminal state. */
    @GetMapping(value = "/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Object>> events(@PathVariable String id) {
        JobRegistry.Job job = jobRegistry.get(id);
        if (job == null) {
            return Flux.just(ServerSentEvent.<Object>builder()
                    .event("error")
                    .data(Map.of("message", "Unknown job: " + id))
                    .build());
        }
        return Flux.interval(Duration.ofMillis(200), Duration.ofMillis(500))
                .map(tick -> job.snapshot())
                .takeUntil(snapshot -> job.isTerminal())
                .map(snapshot -> ServerSentEvent.<Object>builder()
                        .event(job.isTerminal() ? job.status().name().toLowerCase() : "progress")
                        .data(snapshot)
                        .build());
    }

    private String normalizeDatabaseId(String databaseId) {
        return databaseId == null || databaseId.trim().isEmpty() ? "(default)" : databaseId.trim();
    }

    /** FFP-304 restore request body: typed documents + conflict policy + dry-run flag. */
    public record RestoreRequest(
            List<FirestoreBackupService.RestoreDoc> documents,
            String conflictPolicy,
            boolean dryRun) {}
}
