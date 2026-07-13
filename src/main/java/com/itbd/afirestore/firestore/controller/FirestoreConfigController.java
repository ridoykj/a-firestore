package com.itbd.afirestore.firestore.controller;

import com.itbd.afirestore.firestore.service.FirestoreManagerService;

import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Map;

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

    /**
     * FFP-205: Initialize a credential-free connection to a Firestore emulator.
     * Expects a JSON body with the emulator host, project id, and optional database id.
     */
    @PostMapping("/init-emulator")
    public ResponseEntity<String> initEmulator(@RequestBody EmulatorInitRequest request) {
        if (request == null || request.projectId() == null || request.projectId().isBlank()) {
            return ResponseEntity.badRequest().body("The 'projectId' field is required.");
        }
        if (request.emulatorHost() == null || request.emulatorHost().isBlank()) {
            return ResponseEntity.badRequest().body("The 'emulatorHost' field is required.");
        }
        try {
            firestoreManagerService.initializeEmulator(
                    request.projectId(),
                    request.databaseId(),
                    request.emulatorHost());
            return ResponseEntity.ok("Firestore emulator connected for project: " + request.projectId());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to connect to emulator: " + e.getMessage());
        }
    }

    /** FFP-205: request body for {@code POST /api/firestore/init-emulator}. */
    public record EmulatorInitRequest(String projectId, String databaseId, String emulatorHost) {
    }

    // FFP-003/FFP-004: Connection lifecycle management endpoints

    /**
     * Get the current connection status and context.
     */
    @GetMapping("/connection/status")
    public ResponseEntity<Map<String, String>> getConnectionStatus() {
        Map<String, String> status = firestoreManagerService.getActiveConnectionContext();
        return ResponseEntity.ok(status);
    }

    /**
     * Disconnect a specific Firestore connection by project and database.
     */
    @DeleteMapping("/connection")
    public ResponseEntity<String> disconnectConnection(
            @RequestParam String projectId,
            @RequestParam(required = false) String databaseId) {
        try {
            firestoreManagerService.disconnect(projectId, databaseId != null ? databaseId : "");
            return ResponseEntity.ok("Disconnected from " + projectId);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to disconnect: " + e.getMessage());
        }
    }

    /**
     * Disconnect all Firestore connections.
     */
    @DeleteMapping("/connection/all")
    public ResponseEntity<String> disconnectAll() {
        try {
            firestoreManagerService.disconnectAll();
            return ResponseEntity.ok("All connections disconnected.");
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Failed to disconnect all: " + e.getMessage());
        }
    }

    /**
     * Check if a specific connection is active.
     */
    @GetMapping("/connection/exists")
    public ResponseEntity<Map<String, Boolean>> checkConnectionExists(
            @RequestParam String projectId,
            @RequestParam(required = false) String databaseId) {
        boolean exists = firestoreManagerService.isConnected(projectId, databaseId != null ? databaseId : "");
        return ResponseEntity.ok(Map.of("exists", exists));
    }

    /**
     * Get the active connection mode (emulator vs service-account).
     */
    @GetMapping("/connection/mode")
    public ResponseEntity<Map<String, String>> getActiveConnectionMode() {
        String mode = firestoreManagerService.getActiveConnectionMode();
        return ResponseEntity.ok(Map.of("mode", mode));
    }
}
