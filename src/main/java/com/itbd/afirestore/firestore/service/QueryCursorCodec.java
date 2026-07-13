package com.itbd.afirestore.firestore.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import com.itbd.afirestore.firestore.dto.FirestoreValue;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * FFP-105/FFP-203: Encodes and decodes opaque pagination cursors.
 *
 * <p>A cursor captures the ordered field values (as canonical {@link FirestoreValue}s, so typed
 * values like timestamps survive) plus the document ID tiebreaker. FFP-203 supports multiple
 * order clauses, so the cursor stores an ordered <em>list</em> of values (one per order field).
 * The token is base64url-encoded JSON and must be treated as opaque outside the backend.</p>
 *
 * <p>Backward compatibility: the legacy single-value shape ({@code {"orderValue": ...}}) is still
 * decoded, and the single-value {@link #encode(FirestoreValue, String)} overload is retained.</p>
 */
public final class QueryCursorCodec {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private QueryCursorCodec() {
    }

    public record DecodedCursor(List<FirestoreValue> orderValues, String documentId) {
        public DecodedCursor {
            orderValues = orderValues == null ? List.of() : List.copyOf(orderValues);
        }

        /** Convenience accessor for the first ordered value (legacy single-order callers). */
        public FirestoreValue orderValue() {
            return orderValues.isEmpty() ? null : orderValues.get(0);
        }
    }

    /** FFP-105 legacy single-order-value encode; delegates to the multi-value form. */
    public static String encode(FirestoreValue orderValue, String documentId) {
        return encodeAll(orderValue == null ? List.of() : List.of(orderValue), documentId);
    }

    /** FFP-203: encode a cursor with one value per order clause plus the document ID tiebreaker. */
    public static String encodeAll(List<FirestoreValue> orderValues, String documentId) {
        if (documentId == null || documentId.isBlank()) {
            throw new IllegalArgumentException("Cursor requires a document ID.");
        }
        try {
            ObjectNode node = MAPPER.createObjectNode();
            if (orderValues != null && !orderValues.isEmpty()) {
                ArrayNode array = node.putArray("orderValues");
                for (FirestoreValue value : orderValues) {
                    FirestoreValue safe = value == null ? FirestoreValue.NullValue.INSTANCE : value;
                    array.add(MAPPER.valueToTree(safe));
                }
            }
            node.put("documentId", documentId);
            byte[] json = MAPPER.writeValueAsBytes(node);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(json);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encode query cursor.", e);
        }
    }

    public static DecodedCursor decode(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Cursor token is empty.");
        }
        try {
            byte[] json = Base64.getUrlDecoder().decode(token.trim());
            JsonNode node = MAPPER.readTree(new String(json, StandardCharsets.UTF_8));
            JsonNode documentId = node.get("documentId");
            if (documentId == null || !documentId.isTextual() || documentId.textValue().isBlank()) {
                throw new IllegalArgumentException("Cursor is missing its document ID.");
            }

            List<FirestoreValue> orderValues = new ArrayList<>();
            JsonNode array = node.get("orderValues");
            if (array != null && array.isArray()) {
                for (JsonNode element : array) {
                    orderValues.add(element.isNull()
                            ? FirestoreValue.NullValue.INSTANCE
                            : FirestoreValue.Deserializer.fromNode(element));
                }
            } else if (node.hasNonNull("orderValue")) {
                // Legacy single-value token.
                orderValues.add(FirestoreValue.Deserializer.fromNode(node.get("orderValue")));
            }

            return new DecodedCursor(orderValues, documentId.textValue());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid query cursor: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid query cursor.", e);
        }
    }
}
