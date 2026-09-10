package com.itbd.afirestore.firestore.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * DUP-004: The {@code "" -> "(default)"} mapping keys the backend connection registry, the frontend
 * tab id, and the localStorage context key. These tests pin the round trip so the three cannot drift.
 */
class FirestoreIdsTest {

    @ParameterizedTest(name = "normalizeDatabaseId(\"{0}\") = \"{1}\"")
    @CsvSource(nullValues = "NULL", value = {
            "NULL,(default)",
            "'',(default)",
            "'   ',(default)",
            "(default),(default)",
            "analytics,analytics",
            "'  analytics  ',analytics",
    })
    void blankDatabaseIdsBecomeTheDefaultName(String raw, String expected) {
        assertThat(FirestoreIds.normalizeDatabaseId(raw)).isEqualTo(expected);
    }

    @Test
    void blankAndExplicitDefaultResolveToTheSameConnectionKey() {
        assertThat(FirestoreIds.connectionKey("demo", "")).isEqualTo("demo:(default)");
        assertThat(FirestoreIds.connectionKey("demo", null)).isEqualTo("demo:(default)");
        assertThat(FirestoreIds.connectionKey(" demo ", " (default) ")).isEqualTo("demo:(default)");
        assertThat(FirestoreIds.connectionKey("demo", "analytics")).isEqualTo("demo:analytics");
    }

    @Test
    void isDefaultDatabaseIdAcceptsBothSpellings() {
        assertThat(FirestoreIds.isDefaultDatabaseId(null)).isTrue();
        assertThat(FirestoreIds.isDefaultDatabaseId("")).isTrue();
        assertThat(FirestoreIds.isDefaultDatabaseId("(default)")).isTrue();
        assertThat(FirestoreIds.isDefaultDatabaseId("analytics")).isFalse();
    }

    @Test
    void projectIdIsRequired() {
        assertThat(FirestoreIds.requireProjectId(" demo ")).isEqualTo("demo");
        assertThatThrownBy(() -> FirestoreIds.requireProjectId("  "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("projectId is required");
    }
}
