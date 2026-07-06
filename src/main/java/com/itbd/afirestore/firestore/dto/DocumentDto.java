package com.itbd.afirestore.firestore.dto;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FFP-101: Typed document DTO that preserves all Firestore native types.
 *
 * <p>Replaces raw {@code Map<String, Object>} payloads with the canonical
 * {@link FirestoreValue} model so integers vs doubles, timestamps, geo points,
 * references and bytes survive the REST boundary unchanged. {@code updateTime}
 * doubles as the optimistic-concurrency token for FFP-104.</p>
 */
public record DocumentDto(
        String id,
        String path,
        Map<String, FirestoreValue> fields,
        Instant createTime,
        Instant updateTime,
        List<String> subcollections
) {
    public DocumentDto {
        if (fields == null) fields = Map.of();
        if (subcollections == null) subcollections = List.of();
    }

    /**
     * Creates a DocumentDto from raw Firestore document data.
     */
    public static DocumentDto of(String id, String path, Map<String, Object> fields,
                                 Instant createTime, Instant updateTime, List<String> subcollections) {
        Map<String, FirestoreValue> typedFields = new LinkedHashMap<>();
        if (fields != null) {
            fields.forEach((key, value) -> typedFields.put(key, FirestoreValue.from(value)));
        }
        return new DocumentDto(id, path, typedFields, createTime, updateTime, subcollections);
    }

    /**
     * Creates a DocumentDto from raw document data with null timestamps.
     */
    public static DocumentDto of(String id, String path, Map<String, Object> fields) {
        return of(id, path, fields, null, null, List.of());
    }
}
