package com.itbd.afirestore;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.firestore.v1.FirestoreAdminClient;
import com.google.cloud.firestore.v1.FirestoreAdminSettings;
import com.google.firestore.admin.v1.Database;
import com.google.api.gax.core.FixedCredentialsProvider;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class FirestoreManagerService {

    private final Map<String, Firestore> firestoreConnections = new ConcurrentHashMap<>();
    private volatile String activeConnectionKey;

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
        this.activeConnectionKey = connectionKey;
        if (previous != null) {
            try {
                previous.close();
            } catch (Exception ignored) {
                // ignore close failures
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

    private String connectionKey(String projectId, String databaseId) {
        return projectId + ":" + databaseId;
    }

    private String normalizeProjectId(String projectId) {
        if (projectId == null || projectId.trim().isEmpty()) {
            throw new IllegalArgumentException("projectId is required.");
        }
        return projectId.trim();
    }

    private String normalizeDatabaseId(String databaseId) {
        if (databaseId == null || databaseId.trim().isEmpty()) {
            return "(default)";
        }
        return databaseId.trim();
    }

    private boolean isDefaultDatabaseId(String databaseId) {
        return "(default)".equals(databaseId);
    }
}
