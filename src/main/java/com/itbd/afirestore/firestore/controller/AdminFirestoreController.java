package com.itbd.afirestore.firestore.controller;

import com.itbd.afirestore.firestore.service.GenericFirestoreService;
import com.itbd.afirestore.firestore.support.FirestoreIds;
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
        return genericFirestoreService
                .getAllDatabases(projectId, FirestoreIds.normalizeDatabaseId(databaseId))
                .map(ResponseEntity::ok);
    }


}
