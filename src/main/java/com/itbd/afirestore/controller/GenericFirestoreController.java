package com.itbd.afirestore.controller;

import com.itbd.afirestore.service.GenericFirestoreService;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    public Mono<ResponseEntity<?>> get(
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
                        .<ResponseEntity<?>>map(ResponseEntity::ok)
                        .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
            }

            int safeLimit = Math.max(1, Math.min(limit == null ? 50 : limit, 500));
            int safePage = Math.max(0, page == null ? 0 : page);
            return genericFirestoreService.getAllDocumentsPage(projectId, normalizedDatabaseId, path, safePage, safeLimit)
                    .<ResponseEntity<?>>map(result -> {
                        Map<String, Object> payload = new LinkedHashMap<>();
                        payload.put("documents", result.documents());
                        payload.put("page", result.pageIndex());
                        payload.put("limit", result.pageSize());
                        payload.put("hasNextPage", result.hasNextPage());
                        payload.put("hasPreviousPage", result.pageIndex() > 0);
                        return ResponseEntity.ok(payload);
                    })
                    .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
        } else {
            // Even number of segments -> Document Path
            return genericFirestoreService.getDocument(projectId, normalizedDatabaseId, path)
                    .<ResponseEntity<?>>map(ResponseEntity::ok)
                    .defaultIfEmpty(ResponseEntity.notFound().build())
                    .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
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
     * UPDATE a document dynamically.
     */
    @PutMapping("/**")
    public Mono<ResponseEntity<Map<String, Object>>> update(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId,
            @RequestBody Map<String, Object> data) {
        String path = extractFirestorePath(request);
        return genericFirestoreService.updateDocument(projectId, normalizeDatabaseId(databaseId), path, data)
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
    }

    /**
     * DELETE a document dynamically.
     */
    @DeleteMapping("/**")
    public Mono<ResponseEntity<String>> delete(
            ServerHttpRequest request,
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId) {
        String path = extractFirestorePath(request);
        return genericFirestoreService.deleteDocument(projectId, normalizeDatabaseId(databaseId), path)
                .map(deletedId -> ResponseEntity.ok("Document " + deletedId + " deleted successfully."))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body("Error deleting document: " + e.getMessage())));
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
}
