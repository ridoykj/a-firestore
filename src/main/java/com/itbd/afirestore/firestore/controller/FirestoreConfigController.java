package com.itbd.afirestore.firestore.controller;

import com.itbd.afirestore.firestore.service.FirestoreManagerService;

import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/firestore")
public class FirestoreConfigController {

    private final FirestoreManagerService firestoreManagerService;

    public FirestoreConfigController(FirestoreManagerService firestoreManagerService) {
        this.firestoreManagerService = firestoreManagerService;
    }

    /**
     * Endpoint to configure Firestore at runtime.
     * Expects a multipart/form-data request with 'projectId' text part and 'file' part containing the JSON file.
     */
    @PostMapping(value = "/init", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<String>> initFirestore(
            @RequestPart("projectId") String projectId,
            @RequestPart(value = "databaseId", required = false) String databaseId,
            @RequestPart("file") FilePart filePart) {

        if (projectId == null || projectId.isEmpty()) {
            return Mono.just(ResponseEntity.badRequest().body("The 'projectId' field is required."));
        }

        return DataBufferUtils.join(filePart.content())
                .map(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    return new String(bytes, StandardCharsets.UTF_8);
                })
                .defaultIfEmpty("")
                .map(serviceAccountJson -> {
                    if (serviceAccountJson.isEmpty()) {
                        return ResponseEntity.badRequest().body("The 'file' part is required and cannot be empty.");
                    }
                    try {
                        // Pass the databaseId down to the service
                        firestoreManagerService.initializeFirestore(projectId, databaseId, serviceAccountJson);
                        return ResponseEntity.ok("Firestore successfully initialized for project: " + projectId);
                    } catch (Exception e) {
                        return ResponseEntity.internalServerError().body("Failed to initialize Firestore: " + e.getMessage());
                    }
                });
    }
}
