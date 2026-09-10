package com.itbd.afirestore.firestore.controller;

import com.itbd.afirestore.firestore.dto.DocumentWriteRequest;
import com.itbd.afirestore.firestore.service.GenericFirestoreService;
import com.itbd.afirestore.firestore.support.FirestoreIds;
import com.itbd.afirestore.firestore.support.FirestorePaths;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DUP-007: This controller throws; it does not format errors. {@code RestExceptionHandler} turns
 * {@link IllegalArgumentException} into a 400, {@code NotFoundException} into a 404, and
 * {@link GenericFirestoreService.OptimisticConcurrencyException} into a 409 carrying the latest
 * document, so every endpoint returns the same {@code ErrorResponse} shape with a correlation ID.
 */
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
    public Mono<List<String>> getAllCollections(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId) {
        return genericFirestoreService.getAllCollections(projectId, FirestoreIds.normalizeDatabaseId(databaseId));
    }

    /**
     * READ either ALL documents from a collection OR a single document, depending on path depth.
     */
    @GetMapping("/**")
    public Mono<Object> get(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "page", required = false) Integer page) {
        String path = extractFirestorePath(request);
        String normalizedDatabaseId = FirestoreIds.normalizeDatabaseId(databaseId);

        if (FirestorePaths.isDocument(path)) {
            return genericFirestoreService.getDocumentDetails(projectId, normalizedDatabaseId, path)
                    .map(document -> (Object) document);
        }

        if (limit == null && page == null) {
            return genericFirestoreService.getAllDocuments(projectId, normalizedDatabaseId, path)
                    .map(documents -> (Object) documents);
        }

        int safeLimit = Math.clamp(limit == null ? 50 : limit, 1, 500);
        int safePage = Math.max(0, page == null ? 0 : page);
        return genericFirestoreService
                .getAllDocumentsPage(projectId, normalizedDatabaseId, path, safePage, safeLimit)
                .map(result -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("documents", result.documents());
                    payload.put("page", result.pageIndex());
                    payload.put("limit", result.pageSize());
                    payload.put("hasNextPage", result.hasNextPage());
                    payload.put("hasPreviousPage", result.pageIndex() > 0);
                    return (Object) payload;
                });
    }

    /**
     * CREATE a document in a dynamic collection.
     */
    @PostMapping("/**")
    public Mono<Map<String, Object>> create(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "docId", required = false) String docId,
            @RequestBody Map<String, Object> data) {
        String collectionPath = FirestorePaths.normalize(extractFirestorePath(request));
        if (collectionPath.isEmpty()) {
            throw new IllegalArgumentException("Collection path is required.");
        }
        if (!FirestorePaths.isCollection(collectionPath)) {
            throw new IllegalArgumentException("Collection path must contain an odd number of path segments.");
        }

        String normalizedDocId = docId == null ? "" : docId.trim();
        if (normalizedDocId.contains("/")) {
            throw new IllegalArgumentException("Document ID cannot contain '/'. Provide only the ID, not a path.");
        }
        if (".".equals(normalizedDocId) || "..".equals(normalizedDocId)) {
            throw new IllegalArgumentException("Document ID cannot be '.' or '..'.");
        }

        return genericFirestoreService.createDocument(
                projectId,
                FirestoreIds.normalizeDatabaseId(databaseId),
                collectionPath,
                normalizedDocId.isEmpty() ? null : normalizedDocId,
                data == null ? Map.of() : data);
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
    public Mono<Object> update(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody DocumentWriteRequest writeRequest) {
        String path = extractFirestorePath(request);
        return genericFirestoreService
                .writeDocument(projectId, FirestoreIds.normalizeDatabaseId(databaseId), path, writeRequest)
                .map(document -> (Object) document);
    }

    /**
     * DELETE a document dynamically. When {@code expectedUpdateTime} is supplied, the delete is
     * guarded by an atomic update-time precondition (FFP-104).
     */
    @DeleteMapping("/**")
    public Mono<Map<String, Object>> delete(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestParam(value = "expectedUpdateTime", required = false) String expectedUpdateTime) {
        String path = extractFirestorePath(request);
        Instant expected = parseExpectedUpdateTime(expectedUpdateTime);

        return genericFirestoreService
                .deleteDocument(projectId, FirestoreIds.normalizeDatabaseId(databaseId), path, expected)
                .thenReturn(Map.of("message", (Object) "Document deleted successfully."));
    }

    /** FFP-104: the optional optimistic-concurrency guard, as an ISO-8601 instant. */
    private static Instant parseExpectedUpdateTime(String rawExpectedUpdateTime) {
        if (rawExpectedUpdateTime == null || rawExpectedUpdateTime.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(rawExpectedUpdateTime.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("expectedUpdateTime must be an ISO-8601 instant.");
        }
    }

    /**
     * Firestore paths arrive as the wildcard tail of the mapping, so they are pulled from the
     * request rather than bound with {@code @PathVariable} (they contain slashes). Slash cleanup is
     * {@link FirestorePaths#normalize(String)}'s job.
     */
    private String extractFirestorePath(ServerHttpRequest request) {
        String fullPath = request.getPath().pathWithinApplication().value();
        String prefix = "/api/collections/";
        String extracted = fullPath.startsWith(prefix) ? fullPath.substring(prefix.length()) : fullPath;
        return FirestorePaths.normalize(extracted);
    }
}
