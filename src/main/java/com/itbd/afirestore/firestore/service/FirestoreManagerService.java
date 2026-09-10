package com.itbd.afirestore.firestore.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.NoCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.firestore.v1.FirestoreAdminClient;
import com.google.cloud.firestore.v1.FirestoreAdminSettings;
import com.google.firestore.admin.v1.Database;
import com.google.api.gax.core.FixedCredentialsProvider;
import com.itbd.afirestore.firestore.support.FirestoreIds;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class FirestoreManagerService {

    private final Map<String, Firestore> firestoreConnections = new ConcurrentHashMap<>();
    // FFP-205: explicit per-connection mode ("service-account" | "emulator"), replacing the old
    // project-id heuristic. Keyed by the same connection key as firestoreConnections.
    private final Map<String, String> connectionModes = new ConcurrentHashMap<>();
    private volatile String activeConnectionKey;

    static final String MODE_SERVICE_ACCOUNT = "service-account";
    static final String MODE_EMULATOR = "emulator";

    /**
     * FFP-004: Application shutdown hook to close all Firestore clients.
     */
    @PreDestroy
    public void destroy() {
        log.info("Shutting down FirestoreManagerService - closing all connections");
        disconnectAll();
    }

    /**
     * Initializes the Firestore client dynamically using a provided Service Account JSON.
     * @param projectId The Google Cloud Project ID
     * @param databaseId The Firestore Database ID (can be null or empty for default)
     * @param serviceAccountJson The JSON string containing the service account credentials
     */
    public synchronized void initializeFirestore(String projectId, String databaseId, String serviceAccountJson) throws IOException {
        String normalizedProjectId = normalizeProjectId(projectId);
        String normalizedDatabaseId = normalizeDatabaseId(databaseId);
        String connectionKey = connectionKey(normalizedProjectId, normalizedDatabaseId);

        ByteArrayInputStream credentialsStream = new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8));

        GoogleCredentials credentials = GoogleCredentials.fromStream(credentialsStream);

        FirestoreOptions.Builder optionsBuilder = FirestoreOptions.newBuilder()
                .setCredentials(credentials)
                .setProjectId(normalizedProjectId);

        // Explicitly set the databaseId if provided
        if (!isDefaultDatabaseId(normalizedDatabaseId)) {
            optionsBuilder.setDatabaseId(normalizedDatabaseId);
        }

        Firestore replacement = optionsBuilder.build().getService();
        Firestore previous = firestoreConnections.put(connectionKey, replacement);
        connectionModes.put(connectionKey, MODE_SERVICE_ACCOUNT);
        this.activeConnectionKey = connectionKey;
        if (previous != null) {
            try {
                previous.close();
            } catch (Exception e) {
                log.warn("Error closing replaced Firestore client for key '{}': {}", connectionKey, e.getMessage());
            }
        }
    }

    /**
     * FFP-205: Initializes a credential-free Firestore client pointed at a local emulator.
     * Uses {@link NoCredentials} and an explicit emulator host; the connection is tagged
     * {@value #MODE_EMULATOR} so status reporting can distinguish it from Google Cloud.
     */
    public synchronized void initializeEmulator(String projectId, String databaseId, String emulatorHost) {
        String normalizedProjectId = normalizeProjectId(projectId);
        String normalizedDatabaseId = normalizeDatabaseId(databaseId);
        String connectionKey = connectionKey(normalizedProjectId, normalizedDatabaseId);

        if (emulatorHost == null || emulatorHost.trim().isEmpty()) {
            throw new IllegalArgumentException("emulatorHost is required.");
        }

        FirestoreOptions.Builder optionsBuilder = FirestoreOptions.newBuilder()
                .setProjectId(normalizedProjectId)
                .setEmulatorHost(emulatorHost.trim())
                .setCredentials(NoCredentials.getInstance());

        if (!isDefaultDatabaseId(normalizedDatabaseId)) {
            optionsBuilder.setDatabaseId(normalizedDatabaseId);
        }

        Firestore replacement = optionsBuilder.build().getService();
        Firestore previous = firestoreConnections.put(connectionKey, replacement);
        connectionModes.put(connectionKey, MODE_EMULATOR);
        this.activeConnectionKey = connectionKey;
        if (previous != null) {
            try {
                previous.close();
            } catch (Exception e) {
                log.warn("Error closing replaced Firestore client for key '{}': {}", connectionKey, e.getMessage());
            }
        }
    }

    public List<String> listAvailableDatabases(String projectId, String serviceAccountJson) throws IOException {
        ByteArrayInputStream credentialsStream = new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8));
        GoogleCredentials credentials = GoogleCredentials.fromStream(credentialsStream);

        FirestoreAdminSettings adminSettings = FirestoreAdminSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        try (FirestoreAdminClient adminClient = FirestoreAdminClient.create(adminSettings)) {
            List<String> databaseIds = new ArrayList<>();
            String parent = "projects/" + projectId;

            for (Database database : adminClient.listDatabases(parent).getDatabasesList()) {
                String name = database.getName();
                String databaseId = name.substring(name.lastIndexOf('/') + 1);
                databaseIds.add(databaseId);
            }

            return databaseIds;
        }
    }

    /**
     * Returns the initialized Firestore instance.
     */
    public Firestore getFirestore() {
        if (this.firestoreConnections.isEmpty()) {
            throw new IllegalStateException("Firestore has not been initialized yet. Call the initialization API first.");
        }
        if (this.activeConnectionKey != null) {
            Firestore activeFirestore = this.firestoreConnections.get(this.activeConnectionKey);
            if (activeFirestore != null) {
                return activeFirestore;
            }
        }
        return this.firestoreConnections.values().iterator().next();
    }

    /**
     * Returns the initialized Firestore instance for the given project and database.
     */
    public Firestore getFirestore(String projectId, String databaseId) {
        String key = connectionKey(normalizeProjectId(projectId), normalizeDatabaseId(databaseId));
        Firestore firestore = this.firestoreConnections.get(key);
        if (firestore == null) {
            throw new IllegalStateException("Firestore has not been initialized for project '" + projectId
                    + "' and database '" + normalizeDatabaseId(databaseId) + "'.");
        }
        return firestore;
    }

    /**
     * FFP-003: Explicit disconnect for a specific connection key.
     * Closes the Firestore client and removes it from the connections map.
     */
    public synchronized void disconnect(String projectId, String databaseId) {
        String normalizedProjectId = normalizeProjectId(projectId);
        String normalizedDatabaseId = normalizeDatabaseId(databaseId);
        String connectionKey = connectionKey(normalizedProjectId, normalizedDatabaseId);

        Firestore firestore = this.firestoreConnections.remove(connectionKey);
        this.connectionModes.remove(connectionKey);
        if (firestore != null) {
            try {
                firestore.close();
            } catch (Exception e) {
                log.warn("Error closing Firestore client for key '{}': {}", connectionKey, e.getMessage());
            }

            // Update active connection key if needed
            if (connectionKey.equals(this.activeConnectionKey)) {
                this.activeConnectionKey = this.firestoreConnections.isEmpty() ? null :
                    this.firestoreConnections.keySet().iterator().next();
            }
        }
    }

    /**
     * FFP-003: Disconnect all connections and close all Firestore clients.
     */
    public synchronized void disconnectAll() {
        for (String key : this.firestoreConnections.keySet()) {
            Firestore firestore = this.firestoreConnections.remove(key);
            if (firestore != null) {
                try {
                    firestore.close();
                } catch (Exception e) {
                    log.warn("Error closing Firestore client for key '{}': {}", key, e.getMessage());
                }
            }
        }
        this.connectionModes.clear();
        this.activeConnectionKey = null;
    }

    /**
     * FFP-003: Check if a specific connection exists and is active.
     */
    public boolean isConnected(String projectId, String databaseId) {
        String key = connectionKey(normalizeProjectId(projectId), normalizeDatabaseId(databaseId));
        return this.firestoreConnections.containsKey(key);
    }

    /**
     * FFP-205: Get the active connection mode from the explicit per-connection mode map
     * (emulator vs service-account), rather than guessing from the project id.
     */
    public String getActiveConnectionMode() {
        if (this.activeConnectionKey == null) {
            return "disconnected";
        }
        return this.connectionModes.getOrDefault(this.activeConnectionKey, MODE_SERVICE_ACCOUNT);
    }

    /**
     * FFP-003/FFP-205: Get the active connection context for UI display, including the explicit
     * connection mode.
     */
    public Map<String, String> getActiveConnectionContext() {
        if (this.activeConnectionKey == null) {
            return Map.of("status", "disconnected");
        }

        Firestore firestore = this.firestoreConnections.get(this.activeConnectionKey);
        if (firestore == null) {
            return Map.of("status", "unknown");
        }

        try {
            String projectId = firestore.getOptions().getProjectId();
            String databaseId = firestore.getOptions().getDatabaseId();

            return Map.of(
                "status", "connected",
                "mode", this.connectionModes.getOrDefault(this.activeConnectionKey, MODE_SERVICE_ACCOUNT),
                "projectId", projectId != null ? projectId : "",
                "databaseId", databaseId != null ? databaseId : "(default)",
                "connectionKey", this.activeConnectionKey
            );
        } catch (Exception e) {
            return Map.of("status", "error", "message", e.getMessage());
        }
    }

    // DUP-004: connection identity lives in FirestoreIds so the key, the tab id, and the
    // localStorage context key cannot drift apart.

    private String connectionKey(String projectId, String databaseId) {
        return projectId + ":" + databaseId;
    }

    private String normalizeProjectId(String projectId) {
        return FirestoreIds.requireProjectId(projectId);
    }

    private String normalizeDatabaseId(String databaseId) {
        return FirestoreIds.normalizeDatabaseId(databaseId);
    }

    private boolean isDefaultDatabaseId(String databaseId) {
        return FirestoreIds.DEFAULT_DATABASE_ID.equals(databaseId);
    }
}
