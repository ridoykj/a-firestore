package com.itbd.afirestore.firestore.dto;

import tools.jackson.core.JsonGenerator;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.ValueSerializer;
import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.annotation.JsonSerialize;
import com.google.cloud.firestore.Blob;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.GeoPoint;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FFP-101: Canonical Firestore value model.
 *
 * <p>Follows the Firestore REST value representation: every node on the wire is a JSON object
 * with exactly one explicit value kind, e.g. {@code {"stringValue": "x"}},
 * {@code {"integerValue": "42"}}, {@code {"mapValue": {"fields": {...}}}}. Integers and doubles
 * are distinct kinds, and timestamps, geo points, references and bytes are never collapsed into
 * strings, so values survive API and import/export round trips without type loss.</p>
 *
 * <p>Integer values are serialized as JSON strings (like the Firestore REST API) so that int64
 * values are not corrupted by JavaScript number precision.</p>
 */
@JsonSerialize(using = FirestoreValue.Serializer.class)
@JsonDeserialize(using = FirestoreValue.Deserializer.class)
public sealed interface FirestoreValue permits FirestoreValue.NullValue, FirestoreValue.BooleanValue,
        FirestoreValue.IntegerValue, FirestoreValue.DoubleValue, FirestoreValue.StringValue,
        FirestoreValue.TimestampValue, FirestoreValue.GeoPointValue, FirestoreValue.ReferenceValue,
        FirestoreValue.BytesValue, FirestoreValue.ArrayValue, FirestoreValue.MapValue {

    /**
     * Converts this value into the object shape the Firestore SDK expects for writes.
     *
     * @param firestore required to resolve {@link ReferenceValue} into a {@link DocumentReference};
     *                  may be {@code null} for value trees that contain no references.
     */
    Object toFirestoreObject(Firestore firestore);

    /**
     * Maps a raw value returned by the Firestore SDK (or parsed from JSON) into the canonical
     * model. Unsupported runtime types are rejected instead of being silently stringified.
     */
    static FirestoreValue from(Object value) {
        if (value == null) {
            return NullValue.INSTANCE;
        }
        if (value instanceof Boolean b) {
            return new BooleanValue(b);
        }
        if (value instanceof Long || value instanceof Integer || value instanceof Short || value instanceof Byte) {
            return new IntegerValue(((Number) value).longValue());
        }
        if (value instanceof Double || value instanceof Float) {
            return new DoubleValue(((Number) value).doubleValue());
        }
        if (value instanceof String s) {
            return new StringValue(s);
        }
        if (value instanceof com.google.cloud.Timestamp ts) {
            // Instant.ofEpochSecond keeps the full nanosecond precision; toDate() would truncate to millis.
            return new TimestampValue(Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()));
        }
        if (value instanceof Instant instant) {
            return new TimestampValue(instant);
        }
        if (value instanceof java.util.Date date) {
            return new TimestampValue(date.toInstant());
        }
        if (value instanceof GeoPoint gp) {
            return new GeoPointValue(gp.getLatitude(), gp.getLongitude());
        }
        if (value instanceof DocumentReference ref) {
            return new ReferenceValue(ref.getPath());
        }
        if (value instanceof Blob blob) {
            return new BytesValue(Base64.getEncoder().encodeToString(blob.toBytes()));
        }
        if (value instanceof byte[] bytes) {
            return new BytesValue(Base64.getEncoder().encodeToString(bytes));
        }
        if (value instanceof List<?> list) {
            List<FirestoreValue> items = new ArrayList<>(list.size());
            for (Object item : list) {
                items.add(from(item));
            }
            return new ArrayValue(items);
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, FirestoreValue> fields = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!(entry.getKey() instanceof String key)) {
                    throw new IllegalArgumentException(
                            "Firestore map keys must be strings, got: " + entry.getKey());
                }
                fields.put(key, from(entry.getValue()));
            }
            return new MapValue(fields);
        }
        throw new IllegalArgumentException(
                "Unsupported Firestore value type: " + value.getClass().getName());
    }

    record NullValue() implements FirestoreValue {
        public static final NullValue INSTANCE = new NullValue();

        public Object toFirestoreObject(Firestore firestore) {
            return null;
        }
    }

    record BooleanValue(boolean value) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return value;
        }
    }

    record IntegerValue(long value) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return value;
        }
    }

    record DoubleValue(double value) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return value;
        }
    }

    record StringValue(String value) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return value;
        }
    }

    record TimestampValue(Instant value) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return com.google.cloud.Timestamp.ofTimeSecondsAndNanos(value.getEpochSecond(), value.getNano());
        }
    }

    record GeoPointValue(double latitude, double longitude) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return new GeoPoint(latitude, longitude);
        }
    }

    record ReferenceValue(String path) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            if (firestore == null) {
                throw new IllegalStateException(
                        "A Firestore client is required to resolve reference value: " + path);
            }
            return firestore.document(path);
        }
    }

    /** Bytes are carried as a base64 string so the record keeps value equality semantics. */
    record BytesValue(String base64) implements FirestoreValue {
        public Object toFirestoreObject(Firestore firestore) {
            return Blob.fromBytes(Base64.getDecoder().decode(base64));
        }
    }

    record ArrayValue(List<FirestoreValue> items) implements FirestoreValue {
        public ArrayValue {
            if (items == null) {
                items = List.of();
            }
        }

        public Object toFirestoreObject(Firestore firestore) {
            List<Object> raw = new ArrayList<>(items.size());
            for (FirestoreValue item : items) {
                raw.add(item == null ? null : item.toFirestoreObject(firestore));
            }
            return raw;
        }
    }

    record MapValue(Map<String, FirestoreValue> fields) implements FirestoreValue {
        public MapValue {
            if (fields == null) {
                fields = Map.of();
            }
        }

        public Object toFirestoreObject(Firestore firestore) {
            Map<String, Object> raw = new LinkedHashMap<>();
            fields.forEach((key, item) -> raw.put(key, item == null ? null : item.toFirestoreObject(firestore)));
            return raw;
        }
    }

    class Serializer extends ValueSerializer<FirestoreValue> {
        @Override
        public void serialize(FirestoreValue value, JsonGenerator gen, SerializationContext ctxt) {
            gen.writeStartObject();
            switch (value) {
                case NullValue ignored -> gen.writeNullProperty("nullValue");
                case BooleanValue v -> gen.writeBooleanProperty("booleanValue", v.value());
                case IntegerValue v -> gen.writeStringProperty("integerValue", Long.toString(v.value()));
                case DoubleValue v -> gen.writeNumberProperty("doubleValue", v.value());
                case StringValue v -> gen.writeStringProperty("stringValue", v.value());
                case TimestampValue v -> gen.writeStringProperty("timestampValue", v.value().toString());
                case GeoPointValue v -> {
                    gen.writeName("geoPointValue");
                    gen.writeStartObject();
                    gen.writeNumberProperty("latitude", v.latitude());
                    gen.writeNumberProperty("longitude", v.longitude());
                    gen.writeEndObject();
                }
                case ReferenceValue v -> gen.writeStringProperty("referenceValue", v.path());
                case BytesValue v -> gen.writeStringProperty("bytesValue", v.base64());
                case ArrayValue v -> {
                    gen.writeName("arrayValue");
                    gen.writeStartObject();
                    gen.writeName("values");
                    gen.writeStartArray();
                    for (FirestoreValue item : v.items()) {
                        serialize(item == null ? NullValue.INSTANCE : item, gen, ctxt);
                    }
                    gen.writeEndArray();
                    gen.writeEndObject();
                }
                case MapValue v -> {
                    gen.writeName("mapValue");
                    gen.writeStartObject();
                    gen.writeName("fields");
                    gen.writeStartObject();
                    for (Map.Entry<String, FirestoreValue> entry : v.fields().entrySet()) {
                        gen.writeName(entry.getKey());
                        serialize(entry.getValue() == null ? NullValue.INSTANCE : entry.getValue(),
                                gen, ctxt);
                    }
                    gen.writeEndObject();
                    gen.writeEndObject();
                }
            }
            gen.writeEndObject();
        }
    }

    class Deserializer extends ValueDeserializer<FirestoreValue> {
        @Override
        public FirestoreValue deserialize(JsonParser parser, DeserializationContext context) {
            JsonNode node = context.readTree(parser);
            return fromNode(node);
        }

        public static FirestoreValue fromNode(JsonNode node) {
            if (node == null || node.isNull()) {
                return NullValue.INSTANCE;
            }
            if (!node.isObject() || node.size() != 1) {
                throw new IllegalArgumentException(
                        "A Firestore value must be an object with exactly one value kind, got: " + node);
            }
            String kind = node.propertyNames().iterator().next();
            JsonNode body = node.get(kind);
            return switch (kind) {
                case "nullValue" -> NullValue.INSTANCE;
                case "booleanValue" -> new BooleanValue(requireBoolean(body, kind));
                case "integerValue" -> new IntegerValue(parseInteger(body));
                case "doubleValue" -> new DoubleValue(requireNumber(body, kind));
                case "stringValue" -> new StringValue(requireText(body, kind));
                case "timestampValue" -> new TimestampValue(parseTimestamp(body));
                case "geoPointValue" -> parseGeoPoint(body);
                case "referenceValue" -> new ReferenceValue(requireText(body, kind));
                case "bytesValue" -> parseBytes(body);
                case "arrayValue" -> parseArray(body);
                case "mapValue" -> parseMap(body);
                default -> throw new IllegalArgumentException("Unknown Firestore value kind: " + kind);
            };
        }

        private static boolean requireBoolean(JsonNode body, String kind) {
            if (body == null || !body.isBoolean()) {
                throw new IllegalArgumentException(kind + " must be a boolean, got: " + body);
            }
            return body.booleanValue();
        }

        private static double requireNumber(JsonNode body, String kind) {
            if (body == null || !body.isNumber()) {
                throw new IllegalArgumentException(kind + " must be a number, got: " + body);
            }
            return body.doubleValue();
        }

        private static String requireText(JsonNode body, String kind) {
            if (body == null || !body.isTextual()) {
                throw new IllegalArgumentException(kind + " must be a string, got: " + body);
            }
            return body.textValue();
        }

        private static long parseInteger(JsonNode body) {
            if (body != null && body.isIntegralNumber()) {
                return body.longValue();
            }
            if (body != null && body.isTextual()) {
                try {
                    return Long.parseLong(body.textValue().trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("integerValue is not a valid integer: " + body);
                }
            }
            throw new IllegalArgumentException("integerValue must be an integer or string, got: " + body);
        }

        private static Instant parseTimestamp(JsonNode body) {
            String text = requireText(body, "timestampValue");
            try {
                return Instant.parse(text);
            } catch (DateTimeParseException e) {
                throw new IllegalArgumentException(
                        "timestampValue must be an ISO-8601 instant, got: " + text);
            }
        }

        private static GeoPointValue parseGeoPoint(JsonNode body) {
            if (body == null || !body.isObject() || !body.path("latitude").isNumber()
                    || !body.path("longitude").isNumber()) {
                throw new IllegalArgumentException(
                        "geoPointValue must be an object with numeric latitude/longitude, got: " + body);
            }
            return new GeoPointValue(body.get("latitude").doubleValue(), body.get("longitude").doubleValue());
        }

        private static BytesValue parseBytes(JsonNode body) {
            String text = requireText(body, "bytesValue");
            try {
                Base64.getDecoder().decode(text);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("bytesValue must be base64 encoded.");
            }
            return new BytesValue(text);
        }

        private static ArrayValue parseArray(JsonNode body) {
            if (body == null || !body.isObject()) {
                throw new IllegalArgumentException("arrayValue must be an object with a values array.");
            }
            JsonNode values = body.get("values");
            if (values == null || values.isNull()) {
                return new ArrayValue(List.of());
            }
            if (!values.isArray()) {
                throw new IllegalArgumentException("arrayValue.values must be an array, got: " + values);
            }
            List<FirestoreValue> items = new ArrayList<>(values.size());
            for (JsonNode item : values) {
                items.add(fromNode(item));
            }
            return new ArrayValue(items);
        }

        private static MapValue parseMap(JsonNode body) {
            if (body == null || !body.isObject()) {
                throw new IllegalArgumentException("mapValue must be an object with a fields map.");
            }
            JsonNode fields = body.get("fields");
            if (fields == null || fields.isNull()) {
                return new MapValue(Map.of());
            }
            if (!fields.isObject()) {
                throw new IllegalArgumentException("mapValue.fields must be an object, got: " + fields);
            }
            Map<String, FirestoreValue> mapped = new LinkedHashMap<>();
            for (Map.Entry<String, JsonNode> entry : fields.properties()) {
                mapped.put(entry.getKey(), fromNode(entry.getValue()));
            }
            return new MapValue(mapped);
        }
    }
}
