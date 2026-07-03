package com.itbd.afirestore.firestore.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * FFP-101: Typed document DTO that preserves all Firestore native types.
 * 
 * Replaces raw Map<String, Object> with explicit type discrimination for:
 * - Integers vs doubles (Firestore distinguishes these)
 * - Timestamps, geopoints, references, bytes
 * - Arrays and nested maps
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
     * Converts to a raw document map for backward compatibility.
     */
    public Map<String, Object> toRawDocument() {
        return fields.entrySet().stream()
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                e -> e.getValue().toFirestoreObject()
            ));
    }

    /**
     * Creates a DocumentDto from raw Firestore document data.
     */
    public static DocumentDto of(String id, String path, Map<String, Object> fields, 
                                  Instant createTime, Instant updateTime, List<String> subcollections) {
        Map<String, FirestoreValue> typedFields = fields.entrySet().stream()
            .collect(java.util.stream.Collectors.toMap(
                Map.Entry::getKey,
                e -> FirestoreValue.from(e.getValue())
            ));
        
        return new DocumentDto(id, path, typedFields, createTime, updateTime, subcollections);
    }

    /**
     * Creates a DocumentDto from raw document data with null timestamps.
     */
    public static DocumentDto of(String id, String path, Map<String, Object> fields) {
        return of(id, path, fields, null, null, List.of());
    }
}
