package com.itbd.afirestore.firestore.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * FFP-102/FFP-103/FFP-104: Safe write contract for document saves.
 *
 * <ul>
 *   <li>{@code MERGE} changes only the submitted fields and applies explicit field deletions.</li>
 *   <li>{@code REPLACE} makes the submitted field map authoritative; {@code deleteFieldPaths}
 *       must be empty.</li>
 *   <li>{@code deleteFieldPaths} entries use dot notation for nested map fields
 *       (e.g. {@code profile.avatarUrl}). Segments containing dots are not supported;
 *       use REPLACE mode for those documents.</li>
 *   <li>{@code expectedUpdateTime} is required when the target document already exists;
 *       a mismatch fails the write with HTTP 409 and the latest document.</li>
 * </ul>
 */
public record DocumentWriteRequest(
        WriteMode mode,
        Map<String, FirestoreValue> fields,
        List<String> deleteFieldPaths,
        Instant expectedUpdateTime
) {
    public enum WriteMode {MERGE, REPLACE}

    public DocumentWriteRequest {
        if (mode == null) mode = WriteMode.MERGE;
        if (fields == null) fields = Map.of();
        if (deleteFieldPaths == null) deleteFieldPaths = List.of();
    }
}
