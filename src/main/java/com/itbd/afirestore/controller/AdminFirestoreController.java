package com.itbd.afirestore.controller;

import com.itbd.afirestore.service.GenericFirestoreService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminFirestoreController {

    private final GenericFirestoreService genericFirestoreService;

    public AdminFirestoreController(GenericFirestoreService genericFirestoreService) {
        this.genericFirestoreService = genericFirestoreService;
    }

    /**
     * GET a list of all databases in the configured GCP Project.
     */
    @GetMapping("/databases")
    public Mono<ResponseEntity<List<String>>> getAllDatabases(
            @RequestHeader("X-Project-Id") String projectId,
            @RequestHeader(value = "X-Database-Id", required = false) String databaseId) {
        String normalizedDatabaseId = databaseId == null || databaseId.trim().isEmpty()
                ? "(default)"
                : databaseId.trim();
        return genericFirestoreService.getAllDatabases(projectId, normalizedDatabaseId)
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().build()));
    }


}
