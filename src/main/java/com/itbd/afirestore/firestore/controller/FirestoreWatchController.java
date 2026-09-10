package com.itbd.afirestore.firestore.controller;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.ListenerRegistration;
import com.google.cloud.firestore.Query;
import com.itbd.afirestore.firestore.dto.DocumentDto;
import com.itbd.afirestore.firestore.service.FirestoreManagerService;
import com.itbd.afirestore.firestore.support.FirestoreIds;
import com.itbd.afirestore.firestore.support.FirestorePaths;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FFP-306: Real-time watch mode. Bridges a Firestore document or collection snapshot listener to
 * an SSE stream; the listener is removed when the client disconnects. Change events carry typed
 * document data so the client can show updates, but the client decides whether to apply them
 * (it must never overwrite an unsaved draft).
 */
@Slf4j
@RestController
@RequestMapping("/api/workbench")
public class FirestoreWatchController {

    private final FirestoreManagerService firestoreManagerService;

    public FirestoreWatchController(FirestoreManagerService firestoreManagerService) {
        this.firestoreManagerService = firestoreManagerService;
    }

    @GetMapping(value = "/watch", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Object>> watch(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam("path") String path,
            @RequestParam(value = "limit", defaultValue = "50") Integer limit) {
        String normalizedPath = FirestorePaths.normalize(path);
        if (normalizedPath.isBlank()) {
            return Flux.just(sse("error", Map.of("message", "Path is required.")));
        }

        Firestore firestore;
        try {
            firestore = firestoreManagerService.getFirestore(
                    projectId, FirestoreIds.normalizeDatabaseId(databaseId));
        } catch (RuntimeException e) {
            return Flux.just(sse("error", Map.of("message", e.getMessage() == null ? "Not connected." : e.getMessage())));
        }

        int safeLimit = Math.clamp(limit == null ? 50 : limit, 1, 500);
        boolean isCollection = FirestorePaths.isCollection(normalizedPath);

        Sinks.Many<ServerSentEvent<Object>> sink = Sinks.many().multicast().onBackpressureBuffer();
        final ListenerRegistration registration;

        if (isCollection) {
            Query query = firestore.collection(normalizedPath).limit(safeLimit);
            registration = query.addSnapshotListener((snapshots, error) -> {
                if (error != null || snapshots == null) {
                    sink.tryEmitNext(sse("error", Map.of("message",
                            error == null ? "Listener error." : String.valueOf(error.getMessage()))));
                    return;
                }
                List<Map<String, Object>> changes = new ArrayList<>();
                snapshots.getDocumentChanges().forEach(change -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("changeType", change.getType().name());
                    entry.put("path", change.getDocument().getReference().getPath());
                    entry.put("id", change.getDocument().getId());
                    entry.put("document", DocumentDto.of(
                            change.getDocument().getId(),
                            change.getDocument().getReference().getPath(),
                            change.getDocument().getData()));
                    changes.add(entry);
                });
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("path", normalizedPath);
                data.put("size", snapshots.size());
                data.put("changes", changes);
                sink.tryEmitNext(sse("change", data));
            });
        } else {
            DocumentReference docRef = firestore.document(normalizedPath);
            registration = docRef.addSnapshotListener((snapshot, error) -> {
                if (error != null || snapshot == null) {
                    sink.tryEmitNext(sse("error", Map.of("message",
                            error == null ? "Listener error." : String.valueOf(error.getMessage()))));
                    return;
                }
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("path", normalizedPath);
                data.put("exists", snapshot.exists());
                data.put("document", snapshot.exists()
                        ? DocumentDto.of(snapshot.getId(), normalizedPath, snapshot.getData())
                        : null);
                sink.tryEmitNext(sse("change", data));
            });
        }

        return sink.asFlux()
                .startWith(sse("connected", Map.of("path", normalizedPath,
                        "kind", isCollection ? "collection" : "document")))
                .doFinally(signal -> {
                    try {
                        registration.remove();
                    } catch (Exception e) {
                        log.warn("Failed to remove watch listener for '{}': {}", normalizedPath, e.getMessage());
                    }
                });
    }

    private static ServerSentEvent<Object> sse(String event, Object data) {
        return ServerSentEvent.<Object>builder().event(event).data(data).build();
    }
}
