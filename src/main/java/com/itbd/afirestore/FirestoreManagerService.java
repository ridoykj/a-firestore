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

@Service
public class FirestoreManagerService {

    private Firestore firestore;

    /**
     * Initializes the Firestore client dynamically using a provided Service Account JSON.
     * @param projectId The Google Cloud Project ID
     * @param databaseId The Firestore Database ID (can be null or empty for default)
     * @param serviceAccountJson The JSON string containing the service account credentials
     */
    public synchronized void initializeFirestore(String projectId, String databaseId, String serviceAccountJson) throws IOException {
        ByteArrayInputStream credentialsStream = new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8));

        GoogleCredentials credentials = GoogleCredentials.fromStream(credentialsStream);

        FirestoreOptions.Builder optionsBuilder = FirestoreOptions.newBuilder()
                .setCredentials(credentials)
                .setProjectId(projectId);

        // Explicitly set the databaseId if provided
        if (databaseId != null && !databaseId.trim().isEmpty()) {
            optionsBuilder.setDatabaseId(databaseId.trim());
        }

        if (this.firestore != null) {
            try {
                this.firestore.close();
            } catch (Exception e) {
                // Ignore or log closing error
            }
        }

        this.firestore = optionsBuilder.build().getService();
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
        if (this.firestore == null) {
            throw new IllegalStateException("Firestore has not been initialized yet. Call the initialization API first.");
        }
        return this.firestore;
    }
}
