package com.itbd.afirestore.firestore.dto;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pins the wire contract of the real HTTP layer (Spring Boot 4 encodes with Jackson 3, so
 * FirestoreValue carries tools.jackson annotations). Every value node must use exactly one
 * explicit kind ({@code {"stringValue": ...}}), integers travel as strings so int64 survives
 * JavaScript, and Instants are ISO-8601 strings — the frontend document preview and save
 * flow depend on all three.
 */
@SpringBootTest
@ActiveProfiles({"test", "emulator"})
class DocumentDtoWireFormatTest {

    @TestConfiguration
    static class ProbeConfig {
        @Bean
        ProbeController wireFormatProbeController() {
            return new ProbeController();
        }
    }

    @RestController
    static class ProbeController {
        @GetMapping("/api/test/wire-format-probe")
        DocumentDto probe() {
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("aString", "Ada");
            fields.put("anInteger", 42L);
            fields.put("aBigInteger", 9007199254740993L); // > 2^53: must travel as a string
            fields.put("aDouble", 4.5d);
            fields.put("aBoolean", true);
            fields.put("aNull", null);
            fields.put("aTimestamp", Instant.parse("2026-07-07T01:02:03.456Z"));
            fields.put("aGeoPoint", new com.google.cloud.firestore.GeoPoint(1.5, 2.5));
            fields.put("someBytes", new byte[] {1, 2, 3});
            fields.put("anArray", List.of("a", 1L));
            fields.put("aMap", Map.of("inner", true));
            return DocumentDto.of(
                    "doc-1",
                    "users/doc-1",
                    fields,
                    Instant.parse("2026-07-07T01:02:03.456Z"),
                    Instant.parse("2026-07-07T04:05:06.789Z"),
                    List.of("orders"));
        }

        @PostMapping("/api/test/wire-format-probe")
        Map<String, Object> decode(@RequestBody DocumentWriteRequest request) {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("mode", request.mode().name());
            summary.put("expectedUpdateTime", String.valueOf(request.expectedUpdateTime()));
            summary.put("deleteFieldPaths", request.deleteFieldPaths());
            request.fields().forEach((key, value) ->
                    summary.put(key, value == null ? "null" : value.getClass().getSimpleName()));
            return summary;
        }
    }

    @Autowired
    private ApplicationContext applicationContext;

    private WebTestClient client() {
        return WebTestClient.bindToApplicationContext(applicationContext).build();
    }

    @Test
    void httpLayerEncodesTheCanonicalFirestoreWireFormat() {
        client().get().uri("/api/test/wire-format-probe")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.fields.aString.stringValue").isEqualTo("Ada")
                .jsonPath("$.fields.anInteger.integerValue").isEqualTo("42")
                .jsonPath("$.fields.aBigInteger.integerValue").isEqualTo("9007199254740993")
                .jsonPath("$.fields.aDouble.doubleValue").isEqualTo(4.5)
                .jsonPath("$.fields.aBoolean.booleanValue").isEqualTo(true)
                .jsonPath("$.fields.aNull.nullValue").isEmpty()
                .jsonPath("$.fields.aTimestamp.timestampValue").isEqualTo("2026-07-07T01:02:03.456Z")
                .jsonPath("$.fields.aGeoPoint.geoPointValue.latitude").isEqualTo(1.5)
                .jsonPath("$.fields.aGeoPoint.geoPointValue.longitude").isEqualTo(2.5)
                .jsonPath("$.fields.someBytes.bytesValue").isEqualTo("AQID")
                .jsonPath("$.fields.anArray.arrayValue.values[0].stringValue").isEqualTo("a")
                .jsonPath("$.fields.anArray.arrayValue.values[1].integerValue").isEqualTo("1")
                .jsonPath("$.fields.aMap.mapValue.fields.inner.booleanValue").isEqualTo(true)
                // The document preview requires ISO-8601 string timestamps.
                .jsonPath("$.createTime").isEqualTo("2026-07-07T01:02:03.456Z")
                .jsonPath("$.updateTime").isEqualTo("2026-07-07T04:05:06.789Z")
                .jsonPath("$.subcollections[0]").isEqualTo("orders");
    }

    @Test
    void httpLayerDecodesDocumentWriteRequestsFromTheCanonicalWireFormat() {
        String body = """
                {
                  "mode": "MERGE",
                  "fields": {
                    "name": {"stringValue": "Ada"},
                    "count": {"integerValue": "9007199254740993"},
                    "when": {"timestampValue": "2026-07-07T01:02:03.456Z"},
                    "meta": {"mapValue": {"fields": {"inner": {"booleanValue": true}}}}
                  },
                  "deleteFieldPaths": ["obsolete"],
                  "expectedUpdateTime": "2026-07-07T04:05:06.789Z"
                }
                """;
        client().post().uri("/api/test/wire-format-probe")
                .header("Content-Type", "application/json")
                .bodyValue(body)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.mode").isEqualTo("MERGE")
                .jsonPath("$.expectedUpdateTime").isEqualTo("2026-07-07T04:05:06.789Z")
                .jsonPath("$.deleteFieldPaths[0]").isEqualTo("obsolete")
                .jsonPath("$.name").isEqualTo("StringValue")
                .jsonPath("$.count").isEqualTo("IntegerValue")
                .jsonPath("$.when").isEqualTo("TimestampValue")
                .jsonPath("$.meta").isEqualTo("MapValue");
    }
}
