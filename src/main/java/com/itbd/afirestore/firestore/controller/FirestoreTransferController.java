package com.itbd.afirestore.firestore.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.itbd.afirestore.firestore.dto.DeepCopyRequest;
import com.itbd.afirestore.firestore.service.FirestoreTransferService;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@RestController
@RequestMapping("/api/transfer")
public class FirestoreTransferController {
    // Note: Source tree/path navigation is served by /api/workbench/nested, not transfer endpoints.

    private final FirestoreTransferService transferService;
    private final FirestoreManagerService firestoreManagerService;
    private final ObjectMapper objectMapper;

    public FirestoreTransferController(FirestoreTransferService transferService, FirestoreManagerService firestoreManagerService, ObjectMapper objectMapper) {
        this.transferService = transferService;
        this.firestoreManagerService = firestoreManagerService;
        this.objectMapper = objectMapper;
    }

    @PostMapping(value = "/init", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<Map<String, Object>>> initTransfer(
            @RequestPart("file") FilePart filePart) {
        return readUploadedJsonFile(filePart)
                .flatMap(serviceAccountJson -> {
                    try {
                        var jsonNode = objectMapper.readTree(serviceAccountJson);
                        String projectId = jsonNode.has("project_id") ? jsonNode.get("project_id").asText() : "";
                        if (projectId.isBlank()) {
                            return Mono.just(ResponseEntity.badRequest().body(Map.of("error", (Object) "Invalid service account file: project_id is missing.")));
                        }
                        return Mono.fromCallable(() -> firestoreManagerService.listAvailableDatabases(projectId, serviceAccountJson))
                                .map(databases -> {
                                    // Sanitize default database id
                                    var sanitized = databases.stream()
                                            .map(db -> "(default)".equals(db) ? "" : db)
                                            .toList();
                                    return ResponseEntity.ok(Map.of(
                                            "projectId", (Object) projectId,
                                            "databases", sanitized,
                                            // Required by /init-source-db in the current frontend flow.
                                            "serviceAccountJson", serviceAccountJson
                                    ));
                                });
                    } catch (Exception e) {
                        return Mono.just(ResponseEntity.badRequest().body(Map.of("error", (Object) "Failed to parse service account JSON")));
                    }
                })
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of("error", (Object) (e.getMessage() == null ? "Initialization failed." : e.getMessage())))));
    }

    @PostMapping("/init-source-db")
    public Mono<ResponseEntity<Map<String, Object>>> initSourceDb(@RequestBody Map<String, String> request) {
        String projectId = request.get("projectId");
        String databaseId = request.get("databaseId");
        String serviceAccountJson = request.get("serviceAccountJson");

        if (projectId == null || serviceAccountJson == null) {
            return Mono.just(ResponseEntity.badRequest().body(Map.of("error", (Object) "projectId and serviceAccountJson are required")));
        }

        return Mono.fromCallable(() -> {
            firestoreManagerService.initializeFirestore(projectId, databaseId == null ? "" : databaseId, serviceAccountJson);
            return ResponseEntity.ok(Map.of("success", (Object) true, "message", "Source database initialized"));
        }).onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of("error", (Object) (e.getMessage() == null ? "Initialization failed." : e.getMessage())))));
    }

    private Mono<String> readUploadedJsonFile(FilePart filePart) {
        return DataBufferUtils.join(filePart.content())
                .map(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    return new String(bytes, StandardCharsets.UTF_8).trim();
                })
                .flatMap(content -> {
                    if (content.isEmpty()) {
                        return Mono.error(new IllegalArgumentException("Uploaded credentials file is empty."));
                    }
                    return Mono.just(content);
                });
    }

    @PostMapping(value = "/deep-copy", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Map<String, Object>>> executeDeepCopy(@RequestBody DeepCopyRequest request) {
        if (request.sourcePaths() == null || request.sourcePaths().isEmpty()) {
            return Flux.just(ServerSentEvent.<Map<String, Object>>builder()
                    .event("error")
                    .data(Map.of("error", (Object) "sourcePaths cannot be empty"))
                    .build());
        }

        AtomicInteger totalCopied = new AtomicInteger(0);
        AtomicBoolean isFinished = new AtomicBoolean(false);
        AtomicReference<Throwable> errorRef = new AtomicReference<>(null);

        // Start the async copy process using Virtual Threads
        transferService.performDeepCopyAsync(request, totalCopied, isFinished, errorRef);

        // Poll progress every 500ms and stream it to the frontend
        return Flux.interval(Duration.ofMillis(500))
                .takeUntil(i -> isFinished.get())
                .map(i -> ServerSentEvent.<Map<String, Object>>builder()
                        .event("progress")
                        .data(Map.of("copied", totalCopied.get(), "status", "in-progress"))
                        .build())
                .concatWith(
                        Mono.fromCallable(() -> {
                            if (errorRef.get() != null) {
                                return ServerSentEvent.<Map<String, Object>>builder()
                                        .event("error")
                                        .data(Map.of("error", (Object) errorRef.get().getMessage()))
                                        .build();
                            }
                            return ServerSentEvent.<Map<String, Object>>builder()
                                    .event("complete")
                                    .data(Map.of("copied", totalCopied.get(), "status", "success"))
                                    .build();
                        })
                );
    }
}
