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
    public Mono<ResponseEntity<List<String>>> getAllCollections() {
        return genericFirestoreService.getAllCollections()
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
    }

    /**
     * READ either ALL documents from a collection OR a single document, depending on path depth.
     */
    @GetMapping("/**")
    public Mono<ResponseEntity<?>> get(
            ServerHttpRequest request,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "page", required = false) Integer page) {
        String path = extractFirestorePath(request);

        int segmentCount = path.split("/").length;
        if (segmentCount % 2 != 0) {
            // Odd number of segments -> Collection Path
            if (limit == null && page == null) {
                return genericFirestoreService.getAllDocuments(path)
                        .<ResponseEntity<?>>map(ResponseEntity::ok)
                        .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
            }

            int safeLimit = Math.max(1, Math.min(limit == null ? 50 : limit, 500));
            int safePage = Math.max(0, page == null ? 0 : page);
            return genericFirestoreService.getAllDocumentsPage(path, safePage, safeLimit)
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
            return genericFirestoreService.getDocument(path)
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
            @RequestBody Map<String, Object> data) {
        String path = extractFirestorePath(request);
        return genericFirestoreService.createDocument(path, data)
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
    }

    /**
     * UPDATE a document dynamically.
     */
    @PutMapping("/**")
    public Mono<ResponseEntity<Map<String, Object>>> update(
            ServerHttpRequest request,
            @RequestBody Map<String, Object> data) {
        String path = extractFirestorePath(request);
        return genericFirestoreService.updateDocument(path, data)
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
    }

    /**
     * DELETE a document dynamically.
     */
    @DeleteMapping("/**")
    public Mono<ResponseEntity<String>> delete(ServerHttpRequest request) {
        String path = extractFirestorePath(request);
        return genericFirestoreService.deleteDocument(path)
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
}
