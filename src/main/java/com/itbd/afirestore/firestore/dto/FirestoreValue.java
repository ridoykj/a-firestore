package com.itbd.afirestore.firestore.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * FFP-101: Canonical Firestore value model.
 * 
 * Represents all Firestore native value types with explicit type discrimination.
 * This ensures round-trip fidelity - values survive API and import/export without type loss.
 */
public sealed interface FirestoreValue permits FirestoreValue.StringValue, FirestoreValue.NumberValue, 
    FirestoreValue.BooleanValue, FirestoreValue.NullValue, FirestoreValue.TimestampValue,
    FirestoreValue.GeoPointValue, FirestoreValue.ReferenceValue, FirestoreValue.BytesValue,
    FirestoreValue.ArrayValue, FirestoreValue.MapValue {

    /**
     * Extracts the value as a Firestore-compatible object for serialization.
     */
    Object toFirestoreObject();

    /**
     * Creates a FirestoreValue from a raw Firestore object.
     */
    static FirestoreValue from(Object value) {
        if (value == null) return NullValue.INSTANCE;
        
        if (value instanceof String s) return StringValue.of(s);
        if (value instanceof Number n) return NumberValue.of(n.doubleValue());
        if (value instanceof Boolean b) return BooleanValue.of(b);
        if (value instanceof Instant t) return TimestampValue.of(t);
        if (value instanceof com.google.cloud.firestore.GeoPoint gp) {
            return GeoPointValue.of(gp.getLatitude(), gp.getLongitude());
        }
        if (value instanceof byte[] bytes) return BytesValue.of(bytes);
        if (value instanceof List<?> list) {
            @SuppressWarnings("unchecked")
            List<Object> items = (List<Object>) list;
            return ArrayValue.of(items.stream().map(FirestoreValue::from).toList());
        }
        if (value instanceof Map<?, ?> map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> typedMap = (Map<String, Object>) map;
            Map<String, FirestoreValue> fields = new java.util.LinkedHashMap<>();
            if (typedMap != null) {
                typedMap.forEach((k, v) -> fields.put(k, from(v)));
            }
            return MapValue.of(fields);
        }
        
        // Fallback for unknown types
        return StringValue.of(value.toString());
    }

    record StringValue(String value) implements FirestoreValue {
        public static StringValue of(String value) { return new StringValue(value); }
        public Object toFirestoreObject() { return value; }
    }

    record NumberValue(double value) implements FirestoreValue {
        public static NumberValue of(double value) { return new NumberValue(value); }
        public Object toFirestoreObject() { return value; }
    }

    record BooleanValue(boolean value) implements FirestoreValue {
        public static BooleanValue of(boolean value) { return new BooleanValue(value); }
        public Object toFirestoreObject() { return value; }
    }

    record NullValue() implements FirestoreValue {
        public static final NullValue INSTANCE = new NullValue();
        public Object toFirestoreObject() { return null; }
    }

    record TimestampValue(Instant value) implements FirestoreValue {
        public static TimestampValue of(Instant value) { return new TimestampValue(value); }
        public Object toFirestoreObject() { return value; }
    }

    record GeoPointValue(double latitude, double longitude) implements FirestoreValue {
        public static GeoPointValue of(double lat, double lon) { return new GeoPointValue(lat, lon); }
        public Object toFirestoreObject() { 
            return new com.google.cloud.firestore.GeoPoint(latitude, longitude);
        }
    }

    record ReferenceValue(String path) implements FirestoreValue {
        public static ReferenceValue of(String path) { return new ReferenceValue(path); }
        public Object toFirestoreObject() { return path; }
    }

    record BytesValue(byte[] value) implements FirestoreValue {
        public static BytesValue of(byte[] value) { return new BytesValue(value); }
        public Object toFirestoreObject() { return value; }
    }

    record ArrayValue(List<FirestoreValue> items) implements FirestoreValue {
        public static ArrayValue of(List<FirestoreValue> items) { return new ArrayValue(items); }
        public Object toFirestoreObject() { 
            return items.stream().map(FirestoreValue::toFirestoreObject).toList();
        }
    }

    record MapValue(Map<String, FirestoreValue> fields) implements FirestoreValue {
        public static MapValue of(Map<String, FirestoreValue> fields) { return new MapValue(fields); }
        public Object toFirestoreObject() { 
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            if (fields != null) {
                fields.forEach((k, v) -> result.put(k, v != null ? v.toFirestoreObject() : null));
            }
            return result;
        }
    }
}
