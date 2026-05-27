package com.itbd.afirestore.dto;

import java.util.List;

public record DeepCopyRequest(
    String sourceProjectId,
    String sourceDatabaseId,
    List<String> sourcePaths, // e.g., ["users", "settings/app_config"]
    String targetProjectId,
    String targetDatabaseId,
    String targetBasePath,
    String conflictResolution // "MERGE" or "OVERWRITE"
) {}
