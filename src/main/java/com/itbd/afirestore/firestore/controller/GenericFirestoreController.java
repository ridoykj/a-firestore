package com.itbd.afirestore.firestore.controller;

import com.itbd.afirestore.common.exception.NotFoundException;
import com.itbd.afirestore.firestore.dto.DocumentWriteRequest;
import com.itbd.afirestore.firestore.service.GenericFirestoreService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/collections")
public class GenericFirestoreController {

    private final GenericFirestoreService genericFirestoreService;

    public GenericFirestoreController(GenericFirestoreService genericFirestoreService) {
        this.genericFirestoreService = genericFirestoreService;
    }

    /**
     * GET a list of all root collections in the Firestore database.
     */
    @GetMapping
    public Mono<ResponseEntity<List<String>>> getAllCollections(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId) {
        return genericFirestoreService.getAllCollections(projectId, normalizeDatabaseId(databaseId))
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
    }

    /**
     * READ either ALL documents from a collection OR a single document, depending on path depth.
     */
    @GetMapping("/**")
    public Mono<ResponseEntity<Object>> get(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "page", required = false) Integer page) {
        String path = extractFirestorePath(request);
        String normalizedDatabaseId = normalizeDatabaseId(databaseId);

        int segmentCount = path.split("/").length;
        if (segmentCount % 2 != 0) {
            // Odd number of segments -> Collection Path
            if (limit == null && page == null) {
                return genericFirestoreService.getAllDocuments(projectId, normalizedDatabaseId, path)
                        .map(docs -> ResponseEntity.ok((Object) docs))
                        .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
            }

            int safeLimit = Math.clamp(limit == null ? 50 : limit, 1, 500);
            int safePage = Math.max(0, page == null ? 0 : page);
            return genericFirestoreService.getAllDocumentsPage(projectId, normalizedDatabaseId, path, safePage, safeLimit)
                    .map(result -> {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("documents", result.documents());
                        payload.put("page", result.pageIndex());
                        payload.put("limit", result.pageSize());
                        payload.put("hasNextPage", result.hasNextPage());
                        payload.put("hasPreviousPage", result.pageIndex() > 0);
                        return ResponseEntity.ok((Object) payload);
                    })
                    .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
        } else {
            // Even number of segments -> Document Path
            return genericFirestoreService.getDocumentDetails(projectId, normalizedDatabaseId, path)
                    .map(doc -> ResponseEntity.ok((Object) doc))
                    .onErrorResume(NotFoundException.class, e ->
                            Mono.just(ResponseEntity.status(404).body(errorBodyObject(e.getMessage()))))
                    .onErrorResume(e -> {
                        log.error("Failed to read document at path '{}': {}", path, e.getMessage(), e);
                        return Mono.just(ResponseEntity.internalServerError().body(errorBodyObject(e.getMessage())));
                    });
        }
    }

    /**
     * CREATE a document in a dynamic collection.
     */
    @PostMapping("/**")
    public Mono<ResponseEntity<Map<String, Object>>> create(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "docId", required = false) String docId,
            @RequestBody Map<String, Object> data) {
        String path = normalizePath(extractFirestorePath(request));
        if (path.isEmpty()) {
            return Mono.just(ResponseEntity.badRequest().body(errorBody("Collection path is required.")));
        }
        if (!isCollectionPath(path)) {
            return Mono.just(ResponseEntity.badRequest().body(errorBody(
                    "Collection path must contain an odd number of path segments.")));
        }

        String normalizedDocId = normalizeDocId(docId);
        if (normalizedDocId.contains("/")) {
            return Mono.just(ResponseEntity.badRequest().body(errorBody(
                    "Document ID cannot contain '/'. Provide only the ID, not a path.")));
        }
        if (".".equals(normalizedDocId) || "..".equals(normalizedDocId)) {
            return Mono.just(ResponseEntity.badRequest().body(errorBody("Document ID cannot be '.' or '..'.")));
        }

        return genericFirestoreService.createDocument(
                        projectId,
                        normalizeDatabaseId(databaseId),
                        path,
                        normalizedDocId.isEmpty() ? null : normalizedDocId,
                        data == null ? Map.of() : data)
                .map(ResponseEntity::ok)
                .onErrorResume(IllegalArgumentException.class, e ->
                        Mono.just(ResponseEntity.badRequest().body(errorBody(e.getMessage()))))
                .onErrorResume(e ->
                        Mono.just(ResponseEntity.internalServerError().body(errorBody(
                                e.getMessage() == null ? "Create failed." : e.getMessage()))));
    }

    /**
     * FFP-102/FFP-103/FFP-104: Write a document using the safe write contract.
     *
     * <p>The body is a {@link DocumentWriteRequest} with an explicit MERGE/REPLACE mode,
     * typed field values, explicit delete-field paths, and the expected update time of the
     * document being edited. A stale {@code expectedUpdateTime} returns HTTP 409 along with
     * the latest document so the client can show a conflict diff.</p>
     */
    @PutMapping("/**")
    public Mono<ResponseEntity<Object>> update(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody DocumentWriteRequest writeRequest) {
        String path = extractFirestorePath(request);
        return genericFirestoreService.writeDocument(projectId, normalizeDatabaseId(databaseId), path, writeRequest)
                .map(doc -> ResponseEntity.ok((Object) doc))
                .onErrorResume(GenericFirestoreService.OptimisticConcurrencyException.class, e ->
                        Mono.just(ResponseEntity.status(409).body(conflictBody(e))))
                .onErrorResume(IllegalArgumentException.class, e ->
                        Mono.just(ResponseEntity.badRequest().body(errorBodyObject(e.getMessage()))))
                .onErrorResume(e -> {
                    log.error("Failed to write document at path '{}': {}", path, e.getMessage(), e);
                    return Mono.just(ResponseEntity.internalServerError().body(errorBodyObject(
                            e.getMessage() == null ? "Write failed." : e.getMessage())));
                });
    }

    /**
     * DELETE a document dynamically. When {@code expectedUpdateTime} is supplied, the delete is
     * guarded by an atomic update-time precondition (FFP-104).
     */
    @DeleteMapping("/**")
    public Mono<ResponseEntity<Object>> delete(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "expectedUpdateTime", required = false) String expectedUpdateTime) {
        String path = extractFirestorePath(request);

        Instant expected;
        try {
            expected = expectedUpdateTime == null || expectedUpdateTime.isBlank()
                    ? null
                    : Instant.parse(expectedUpdateTime.trim());
        } catch (DateTimeParseException e) {
            return Mono.just(ResponseEntity.badRequest().body(errorBodyObject(
                    "expectedUpdateTime must be an ISO-8601 instant.")));
        }

        return genericFirestoreService.deleteDocument(projectId, normalizeDatabaseId(databaseId), path, expected)
                .thenReturn(ResponseEntity.ok(errorBodyObject("Document deleted successfully.")))
                .onErrorResume(GenericFirestoreService.OptimisticConcurrencyException.class, e ->
                        Mono.just(ResponseEntity.status(409).body(conflictBody(e))))
                .onErrorResume(IllegalArgumentException.class, e ->
                        Mono.just(ResponseEntity.badRequest().body(errorBodyObject(e.getMessage()))))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(errorBodyObject(
                        "Error deleting document: " + e.getMessage()))));
    }

    private String extractFirestorePath(ServerHttpRequest request) {
        String fullPath = request.getPath().pathWithinApplication().value();
        String prefix = "/api/collections/";
        String extracted = fullPath;
        if (fullPath.startsWith(prefix)) {
            extracted = fullPath.substring(prefix.length());
        }
        // Clean trailing slashes if they exist
        if (extracted.endsWith("/")) {
            extracted = extracted.substring(0, extracted.length() - 1);
        }
        return extracted;
    }

    private String normalizeDatabaseId(String databaseId) {
        return databaseId == null || databaseId.trim().isEmpty() ? "(default)" : databaseId.trim();
    }

    private String normalizePath(String path) {
        if (path == null) {
            return "";
        }
        String normalized = path.trim();
        if (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private boolean isCollectionPath(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }
        return path.split("/").length % 2 != 0;
    }

    private String normalizeDocId(String docId) {
        return docId == null ? "" : docId.trim();
    }

    private Map<String, Object> errorBody(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message == null || message.isBlank() ? "Request failed." : message);
        return body;
    }

    private Object errorBodyObject(String message) {
        return errorBody(message);
    }

    /** FFP-104: 409 payload carrying the latest document so clients can diff before overwriting. */
    private Object conflictBody(GenericFirestoreService.OptimisticConcurrencyException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("errorCode", "CONFLICT");
        body.put("message", e.getMessage());
        body.put("latestDocument", e.getLatestDocument());
        return body;
    }
}
