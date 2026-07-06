package com.itbd.afirestore.firestore.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.cloud.firestore.Blob;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.GeoPoint;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * FFP-101: Verifies the canonical value model preserves every supported Firestore type
 * across SDK mapping and JSON (REST wire format) round trips.
 */
class FirestoreValueTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void integersAndDoublesStayDistinct() {
        assertThat(FirestoreValue.from(42L)).isEqualTo(new FirestoreValue.IntegerValue(42L));
        assertThat(FirestoreValue.from(42)).isEqualTo(new FirestoreValue.IntegerValue(42L));
        assertThat(FirestoreValue.from(42.0d)).isEqualTo(new FirestoreValue.DoubleValue(42.0d));
        assertThat(FirestoreValue.from(2.5f)).isEqualTo(new FirestoreValue.DoubleValue(2.5d));
    }

    @Test
    void sdkNativeTypesAreMapped() {
        Instant instant = Instant.parse("2026-07-06T10:15:30.123456Z");
        com.google.cloud.Timestamp timestamp = com.google.cloud.Timestamp.ofTimeSecondsAndNanos(
                instant.getEpochSecond(), instant.getNano());
        assertThat(FirestoreValue.from(timestamp)).isEqualTo(new FirestoreValue.TimestampValue(instant));

        assertThat(FirestoreValue.from(new GeoPoint(1.5, -2.5)))
                .isEqualTo(new FirestoreValue.GeoPointValue(1.5, -2.5));

        DocumentReference reference = mock(DocumentReference.class);
        when(reference.getPath()).thenReturn("users/alice");
        assertThat(FirestoreValue.from(reference)).isEqualTo(new FirestoreValue.ReferenceValue("users/alice"));

        byte[] bytes = {1, 2, 3};
        String base64 = Base64.getEncoder().encodeToString(bytes);
        assertThat(FirestoreValue.from(Blob.fromBytes(bytes))).isEqualTo(new FirestoreValue.BytesValue(base64));
        assertThat(FirestoreValue.from(bytes)).isEqualTo(new FirestoreValue.BytesValue(base64));
    }

    @Test
    void nestedArraysAndMapsAreMapped() {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("tags", List.of("a", 1L));
        raw.put("meta", Map.of("count", 3L));

        FirestoreValue value = FirestoreValue.from(raw);

        assertThat(value).isInstanceOf(FirestoreValue.MapValue.class);
        FirestoreValue.MapValue map = (FirestoreValue.MapValue) value;
        assertThat(map.fields().get("tags")).isEqualTo(new FirestoreValue.ArrayValue(List.of(
                new FirestoreValue.StringValue("a"),
                new FirestoreValue.IntegerValue(1L))));
        assertThat(map.fields().get("meta")).isEqualTo(new FirestoreValue.MapValue(Map.of(
                "count", new FirestoreValue.IntegerValue(3L))));
    }

    @Test
    void unsupportedTypesAreRejectedInsteadOfStringified() {
        assertThatThrownBy(() -> FirestoreValue.from(new Object()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported Firestore value type");
    }

    @Test
    void everyKindRoundTripsThroughJson() throws Exception {
        List<FirestoreValue> samples = List.of(
                FirestoreValue.NullValue.INSTANCE,
                new FirestoreValue.BooleanValue(true),
                new FirestoreValue.IntegerValue(Long.MAX_VALUE),
                new FirestoreValue.DoubleValue(3.5d),
                new FirestoreValue.StringValue("hello"),
                new FirestoreValue.TimestampValue(Instant.parse("2026-01-02T03:04:05.000000006Z")),
                new FirestoreValue.GeoPointValue(12.34, -56.78),
                new FirestoreValue.ReferenceValue("users/alice/orders/1"),
                new FirestoreValue.BytesValue(Base64.getEncoder().encodeToString(new byte[]{9, 8, 7})),
                new FirestoreValue.ArrayValue(List.of(
                        new FirestoreValue.IntegerValue(1),
                        new FirestoreValue.DoubleValue(1.0))),
                new FirestoreValue.MapValue(Map.of(
                        "inner", new FirestoreValue.TimestampValue(Instant.parse("2020-01-01T00:00:00Z")))));

        for (FirestoreValue sample : samples) {
            String json = objectMapper.writeValueAsString(sample);
            FirestoreValue restored = objectMapper.readValue(json, FirestoreValue.class);
            assertThat(restored).as("round trip for %s", json).isEqualTo(sample);
        }
    }

    @Test
    void wireFormatUsesOneExplicitValueKindPerNode() throws Exception {
        assertThat(objectMapper.writeValueAsString(new FirestoreValue.IntegerValue(42L)))
                .isEqualTo("{\"integerValue\":\"42\"}");
        assertThat(objectMapper.writeValueAsString(new FirestoreValue.DoubleValue(42.0d)))
                .isEqualTo("{\"doubleValue\":42.0}");
        assertThat(objectMapper.writeValueAsString(new FirestoreValue.StringValue("x")))
                .isEqualTo("{\"stringValue\":\"x\"}");
    }

    @Test
    void integerValueAcceptsNumberAndStringOnTheWire() throws Exception {
        assertThat(objectMapper.readValue("{\"integerValue\":7}", FirestoreValue.class))
                .isEqualTo(new FirestoreValue.IntegerValue(7L));
        assertThat(objectMapper.readValue("{\"integerValue\":\"9007199254740993\"}", FirestoreValue.class))
                .isEqualTo(new FirestoreValue.IntegerValue(9007199254740993L));
    }

    @Test
    void unknownValueKindIsRejected() {
        assertThatThrownBy(() -> objectMapper.readValue("{\"magicValue\":1}", FirestoreValue.class))
                .hasMessageContaining("Unknown Firestore value kind");
    }

    @Test
    void toFirestoreObjectRestoresSdkTypes() {
        Instant instant = Instant.parse("2026-07-06T00:00:00Z");
        Object timestamp = new FirestoreValue.TimestampValue(instant).toFirestoreObject(null);
        assertThat(timestamp).isEqualTo(com.google.cloud.Timestamp.ofTimeSecondsAndNanos(
                instant.getEpochSecond(), instant.getNano()));

        assertThat(new FirestoreValue.IntegerValue(5L).toFirestoreObject(null)).isEqualTo(5L);
        assertThat(new FirestoreValue.DoubleValue(5.0d).toFirestoreObject(null)).isEqualTo(5.0d);
        assertThat(new FirestoreValue.GeoPointValue(1, 2).toFirestoreObject(null))
                .isEqualTo(new GeoPoint(1, 2));
        assertThat(new FirestoreValue.BytesValue(Base64.getEncoder().encodeToString(new byte[]{1}))
                .toFirestoreObject(null)).isEqualTo(Blob.fromBytes(new byte[]{1}));
    }

    @Test
    void referenceValueRequiresFirestoreClient() {
        assertThatThrownBy(() -> new FirestoreValue.ReferenceValue("users/a").toFirestoreObject(null))
                .isInstanceOf(IllegalStateException.class);
    }
}
