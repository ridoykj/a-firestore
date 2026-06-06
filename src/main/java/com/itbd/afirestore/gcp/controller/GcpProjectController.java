package com.itbd.afirestore.gcp.controller;

import com.itbd.afirestore.gcp.service.GcpProjectService;

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
import java.util.List;

@RestController
@RequestMapping("/api/gcp")
public class GcpProjectController {

    private final GcpProjectService gcpProjectService;

    public GcpProjectController(GcpProjectService gcpProjectService) {
        this.gcpProjectService = gcpProjectService;
    }

    /**
     * Endpoint to list all GCP projects the provided credentials have access to.
     * Expects a multipart/form-data request with a 'file' part containing the JSON file.
     */
    @PostMapping(value = "/projects", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<?>> getProjects(@RequestPart("file") FilePart filePart) {
        
        // Read the FilePart completely into a String
        return DataBufferUtils.join(filePart.content())
                .map(dataBuffer -> {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    DataBufferUtils.release(dataBuffer);
                    return new String(bytes, StandardCharsets.UTF_8);
                })
                .defaultIfEmpty("")
                .map(clientSecretJson -> {
                    if (clientSecretJson.isEmpty()) {
                        return ResponseEntity.badRequest().body("The 'file' part is required and cannot be empty.");
                    }
                    try {
                        List<String> projects = gcpProjectService.listAvailableProjects(clientSecretJson);
                        return ResponseEntity.ok(projects);
                    } catch (Exception e) {
                        return ResponseEntity.internalServerError().body("Failed to retrieve projects: " + e.getMessage());
                    }
                });
    }
}
