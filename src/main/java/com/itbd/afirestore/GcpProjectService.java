package com.itbd.afirestore;

import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.resourcemanager.v3.Project;
import com.google.cloud.resourcemanager.v3.ProjectsClient;
import com.google.cloud.resourcemanager.v3.ProjectsSettings;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
public class GcpProjectService {

    /**
     * Lists all Google Cloud Project IDs accessible by the provided Service Account JSON credentials.
     * 
     * @param serviceAccountJson The raw JSON string of the service account or client secret file.
     * @return A list of project IDs.
     */
    public List<String> listAvailableProjects(String serviceAccountJson) throws IOException {
        ByteArrayInputStream credentialsStream = new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8));

        // 1. Initialize credentials from your stream
        GoogleCredentials credentials = GoogleCredentials.fromStream(credentialsStream);

        // 2. Create settings with the credentials provider
        ProjectsSettings projectsSettings = ProjectsSettings.newBuilder()
                .setCredentialsProvider(FixedCredentialsProvider.create(credentials))
                .build();

        // 3. Initialize the client within a try-with-resources (it is AutoCloseable)
        try (ProjectsClient projectsClient = ProjectsClient.create(projectsSettings)) {
            List<String> projectIds = new ArrayList<>();

            // Example: Searching for all active projects
            for (Project project : projectsClient.searchProjects("").iterateAll()) {
                projectIds.add(project.getProjectId());
            }
            return projectIds;
        }
    }
}
