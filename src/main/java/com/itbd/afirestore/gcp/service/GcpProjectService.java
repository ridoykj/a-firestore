package com.itbd.afirestore.gcp.service;

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
        String sanitizedJson = stripUtf8Bom(serviceAccountJson).trim();
        ByteArrayInputStream credentialsStream = new ByteArrayInputStream(sanitizedJson.getBytes(StandardCharsets.UTF_8));

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

    private static final char BOM = '﻿';

    /**
     * Service-account JSON saved via Windows editors (Notepad, PowerShell Out-File) is often
     * prefixed with a UTF-8 BOM. Gson's strict JsonReader treats that as malformed JSON at
     * line 1 column 1, so strip it before parsing credentials.
     */
    private static String stripUtf8Bom(String json) {
        return (!json.isEmpty() && json.charAt(0) == BOM) ? json.substring(1) : json;
    }
}
