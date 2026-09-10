package com.itbd.afirestore.firestore.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * DUP-001: The parity table. These cases are exactly where the six previous normalizers disagreed —
 * each stripped a different amount of slash, which changed the segment count and so flipped the
 * collection/document classification for the same user input.
 */
class FirestorePathsTest {

    @ParameterizedTest(name = "normalize(\"{0}\") = \"{1}\"")
    @CsvSource(nullValues = "NULL", value = {
            "NULL,''",
            "'',''",
            "'   ',''",
            "'/',''",
            "'///',''",
            "users,users",
            "'/users',users",
            "'users/',users",
            "'/users/',users",
            // Interior empty segments were the real divergence: only one of the six old normalizers
            // dropped them, so the others produced a different segment count for the same input.
            "'//users',users",
            "'users//alice','users/alice'",
            "'users///alice','users/alice'",
            "'users/alice/posts','users/alice/posts'",
            "'  users / alice  ','users/alice'",
    })
    void normalizeDropsEveryEmptySegment(String raw, String expected) {
        assertThat(FirestorePaths.normalize(raw)).isEqualTo(expected);
    }

    @Test
    void normalizeIsIdempotentSoPredicatesAcceptRawOrNormalizedInput() {
        String once = FirestorePaths.normalize("//users//alice/");
        assertThat(once).isEqualTo("users/alice");
        assertThat(FirestorePaths.normalize(once)).isEqualTo(once);
    }

    @ParameterizedTest(name = "\"{0}\" -> collection={1} document={2}")
    @CsvSource({
            "users,true,false",
            "'users/alice',false,true",
            "'users/alice/posts',true,false",
            // Regression: '//users' was a collection on the watch endpoint and a document on the
            // workbench endpoint, because their normalizers left a different number of segments.
            "'//users',true,false",
            // Regression: 'users//posts' reached the SDK as 3 segments from the workbench (500) but
            // was collapsed to 2 by the transfer service and copied as a document.
            "'users//posts',false,true",
            "'',false,false",
            "'/',false,false",
    })
    void parityIsDecidedAfterNormalization(String path, boolean collection, boolean document) {
        assertThat(FirestorePaths.isCollection(path)).isEqualTo(collection);
        assertThat(FirestorePaths.isDocument(path)).isEqualTo(document);
    }

    @Test
    void requireDocumentReturnsTheNormalizedPath() {
        assertThat(FirestorePaths.requireDocument("/users//alice/")).isEqualTo("users/alice");
    }

    @Test
    void requireDocumentRejectsCollectionAndBlankPaths() {
        assertThatThrownBy(() -> FirestorePaths.requireDocument("users"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("document path");
        assertThatThrownBy(() -> FirestorePaths.requireDocument("//"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("document path");
    }

    @Test
    void requireCollectionReturnsTheNormalizedPathAndRejectsDocuments() {
        assertThat(FirestorePaths.requireCollection("/users/alice/posts")).isEqualTo("users/alice/posts");
        assertThatThrownBy(() -> FirestorePaths.requireCollection("users/alice"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("collection path");
    }

    @ParameterizedTest(name = "lastSegment(\"{0}\") = \"{1}\"")
    @CsvSource({
            "users,users",
            "'users/alice',alice",
            "'users/alice/posts',posts",
            "'/users/alice/',alice",
            "'',''",
    })
    void lastSegmentIgnoresSurroundingSlashes(String path, String expected) {
        assertThat(FirestorePaths.lastSegment(path)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "parent(\"{0}\") = \"{1}\"")
    @CsvSource({
            "users,''",
            "'users/alice',users",
            "'users/alice/posts','users/alice'",
            "'//users//alice//',users",
            "'',''",
    })
    void parentDropsTheLastSegment(String path, String expected) {
        assertThat(FirestorePaths.parent(path)).isEqualTo(expected);
    }
}
