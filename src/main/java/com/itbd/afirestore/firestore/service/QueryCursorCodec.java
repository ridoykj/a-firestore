package com.itbd.afirestore.firestore.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import com.itbd.afirestore.firestore.dto.FirestoreValue;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * FFP-105: Encodes and decodes opaque pagination cursors.
 *
 * <p>A cursor captures the ordered field value (as a canonical {@link FirestoreValue}, so typed
 * values like timestamps survive) plus the document ID tiebreaker. The token is base64url-encoded
 * JSON and must be treated as opaque outside the backend.</p>
 */
public final class QueryCursorCodec {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private QueryCursorCodec() {
    }

    public record DecodedCursor(FirestoreValue orderValue, String documentId) {
    }

    public static String encode(FirestoreValue orderValue, String documentId) {
        if (documentId == null || documentId.isBlank()) {
            throw new IllegalArgumentException("Cursor requires a document ID.");
        }
        try {
            ObjectNode node = MAPPER.createObjectNode();
            if (orderValue != null) {
                node.set("orderValue", MAPPER.valueToTree(orderValue));
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
            FirestoreValue orderValue = null;
            if (node.hasNonNull("orderValue")) {
                orderValue = FirestoreValue.Deserializer.fromNode(node.get("orderValue"));
            }
            return new DecodedCursor(orderValue, documentId.textValue());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid query cursor: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid query cursor.", e);
        }
    }
}
