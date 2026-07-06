package com.itbd.afirestore.firestore.service;

import com.itbd.afirestore.firestore.dto.FirestoreValue;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * FFP-105: Cursor tokens must round-trip typed order values and stay opaque/validated.
 */
class QueryCursorCodecTest {

    @Test
    void roundTripsDocumentIdOnlyCursor() {
        String token = QueryCursorCodec.encode(null, "doc-42");
        QueryCursorCodec.DecodedCursor decoded = QueryCursorCodec.decode(token);

        assertThat(decoded.documentId()).isEqualTo("doc-42");
        assertThat(decoded.orderValue()).isNull();
    }

    @Test
    void roundTripsTypedOrderValues() {
        FirestoreValue[] orderValues = {
                new FirestoreValue.StringValue("alice"),
                new FirestoreValue.IntegerValue(41L),
                new FirestoreValue.DoubleValue(41.0d),
                new FirestoreValue.TimestampValue(Instant.parse("2026-07-06T10:00:00.123Z")),
                FirestoreValue.NullValue.INSTANCE,
        };

        for (FirestoreValue orderValue : orderValues) {
            String token = QueryCursorCodec.encode(orderValue, "doc-1");
            QueryCursorCodec.DecodedCursor decoded = QueryCursorCodec.decode(token);
            assertThat(decoded.orderValue()).as("order value %s", orderValue).isEqualTo(orderValue);
            assertThat(decoded.documentId()).isEqualTo("doc-1");
        }
    }

    @Test
    void integerAndDoubleCursorsStayDistinct() {
        QueryCursorCodec.DecodedCursor integerCursor = QueryCursorCodec.decode(
                QueryCursorCodec.encode(new FirestoreValue.IntegerValue(1L), "d"));
        QueryCursorCodec.DecodedCursor doubleCursor = QueryCursorCodec.decode(
                QueryCursorCodec.encode(new FirestoreValue.DoubleValue(1.0d), "d"));

        assertThat(integerCursor.orderValue()).isInstanceOf(FirestoreValue.IntegerValue.class);
        assertThat(doubleCursor.orderValue()).isInstanceOf(FirestoreValue.DoubleValue.class);
    }

    @Test
    void rejectsGarbageTokens() {
        assertThatThrownBy(() -> QueryCursorCodec.decode("not-a-cursor!!"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> QueryCursorCodec.decode(""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> QueryCursorCodec.decode(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsCursorWithoutDocumentId() {
        String tokenWithoutId = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"orderValue\":{\"stringValue\":\"x\"}}".getBytes());
        assertThatThrownBy(() -> QueryCursorCodec.decode(tokenWithoutId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("document ID");
    }
}
