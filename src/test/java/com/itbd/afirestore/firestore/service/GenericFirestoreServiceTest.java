package com.itbd.afirestore.firestore.service;

import com.google.api.core.ApiFutures;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.google.cloud.firestore.Transaction;
import com.google.cloud.firestore.WriteBatch;
import com.google.cloud.firestore.WriteResult;
import com.itbd.afirestore.firestore.dto.DocumentDto;
import com.itbd.afirestore.firestore.dto.DocumentWriteRequest;
import com.itbd.afirestore.firestore.dto.FirestoreValue;
import com.itbd.afirestore.firestore.service.GenericFirestoreService.BulkDeleteResult;
import com.itbd.afirestore.firestore.service.GenericFirestoreService.OptimisticConcurrencyException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * FFP-006/FFP-102/FFP-103/FFP-104/FFP-106: Unit tests exercising GenericFirestoreService
 * against a mocked Firestore client (no emulator or network required).
 *
 * The service bean is wired by Spring Boot's test support with its FirestoreManagerService
 * dependency overridden via @MockitoBean; the Firestore SDK objects it hands out are not
 * beans, so those remain plain mocks.
 */
@SpringBootTest(classes = GenericFirestoreService.class, webEnvironment = SpringBootTest.WebEnvironment.NONE)
class GenericFirestoreServiceTest {

    @MockitoBean
    private FirestoreManagerService firestoreManagerService;

    private final Firestore firestore = mock(Firestore.class);

    private final WriteBatch writeBatch = mock(WriteBatch.class);

    private final DocumentReference documentReference = mock(DocumentReference.class);

    @Autowired
    private GenericFirestoreService service;

    private void stubBatchDelete() {
        when(firestoreManagerService.getFirestore("p", "d")).thenReturn(firestore);
        when(firestore.batch()).thenReturn(writeBatch);
        when(firestore.document(anyString())).thenReturn(documentReference);
    }

    // ---------------------------------------------------------------- FFP-106

    @Test
    void batchDeleteRejectsEmptyPathList() {
        assertThatThrownBy(() -> service.batchDeleteDocuments("p", "d", List.of()).block())
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.batchDeleteDocuments("p", "d", null).block())
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void batchDeleteDeletesEveryRequestedPathAtomically() {
        stubBatchDelete();
        when(writeBatch.commit())
                .thenReturn(ApiFutures.immediateFuture(Collections.<WriteResult>emptyList()));

        BulkDeleteResult result =
                service.batchDeleteDocuments("p", "d", List.of("users/a", "users/b")).block();

        assertThat(result).isNotNull();
        assertThat(result.deletedPaths()).containsExactly("users/a", "users/b");
        assertThat(result.failedPaths()).isEmpty();
        assertThat(result.isCompleteSuccess()).isTrue();
        verify(writeBatch, times(2)).delete(documentReference);
        verify(writeBatch, times(1)).commit();
    }

    @Test
    void batchDeleteReportsFailedPathsInsteadOfThrowing() {
        stubBatchDelete();
        when(writeBatch.commit())
                .thenReturn(ApiFutures.immediateFailedFuture(new RuntimeException("commit failed")));

        BulkDeleteResult result =
                service.batchDeleteDocuments("p", "d", List.of("users/a", "users/b")).block();

        assertThat(result).isNotNull();
        assertThat(result.deletedPaths()).isEmpty();
        assertThat(result.failedPaths()).containsExactly("users/a", "users/b");
        assertThat(result.isCompleteSuccess()).isFalse();
    }

    @Test
    void batchDeleteRejectsMoreThan500UniquePaths() {
        List<String> paths = IntStream.range(0, 501)
                .mapToObj(i -> "users/doc-" + i)
                .toList();

        assertThatThrownBy(() -> service.batchDeleteDocuments("p", "d", paths).block())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at most 500");
    }

    @Test
    void batchDeleteDeduplicatesPathsBeforeDeleting() {
        stubBatchDelete();
        when(writeBatch.commit())
                .thenReturn(ApiFutures.immediateFuture(Collections.<WriteResult>emptyList()));

        BulkDeleteResult result = service
                .batchDeleteDocuments("p", "d", List.of("users/a", "/users/a/", "users/b"))
                .block();

        assertThat(result).isNotNull();
        assertThat(result.deletedPaths()).containsExactly("users/a", "users/b");
        verify(writeBatch, times(2)).delete(documentReference);
    }

    @Test
    void batchDeleteRejectsCollectionPaths() {
        assertThatThrownBy(() -> service.batchDeleteDocuments("p", "d", List.of("users")).block())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Not a document path");
        assertThatThrownBy(() -> service.batchDeleteDocuments("p", "d", List.of("users/a", " ")).block())
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ------------------------------------------------------- FFP-102/103/104

    @Test
    void writeDocumentRejectsCollectionPaths() {
        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.MERGE, Map.of(), List.of(), null);

        assertThatThrownBy(() -> service.writeDocument("p", "d", "users", request).block())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("document path");
    }

    @Test
    void writeDocumentRejectsDeletePathsInReplaceMode() {
        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.REPLACE, Map.of(), List.of("stale"), null);

        assertThatThrownBy(() -> service.writeDocument("p", "d", "users/a", request).block())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("MERGE");
    }

    @Test
    void writeDocumentRejectsMalformedDeletePaths() {
        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.MERGE, Map.of(), List.of("a..b"), null);

        assertThatThrownBy(() -> service.writeDocument("p", "d", "users/a", request).block())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid delete field path");
    }

    @Test
    void deleteSentinelsAreNestedIntoTheMergePayload() {
        Map<String, Object> merged = GenericFirestoreService.withDeleteSentinels(
                Map.of("name", "alice"), List.of("stale", "profile.avatarUrl"));

        assertThat(merged.get("name")).isEqualTo("alice");
        assertThat(merged.get("stale")).isEqualTo(FieldValue.delete());
        assertThat(merged.get("profile")).isInstanceOf(Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> profile = (Map<String, Object>) merged.get("profile");
        assertThat(profile.get("avatarUrl")).isEqualTo(FieldValue.delete());
    }

    @Test
    void deleteSentinelConflictingWithSubmittedFieldIsRejected() {
        assertThatThrownBy(() -> GenericFirestoreService.withDeleteSentinels(
                Map.of("name", "alice"), List.of("name")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("conflicts");

        assertThatThrownBy(() -> GenericFirestoreService.withDeleteSentinels(
                Map.of("name", "alice"), List.of("name.nested")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("conflicts");
    }

    @Test
    void writeDocumentRequiresExpectedUpdateTimeForExistingDocuments() {
        DocumentSnapshot existing = mock(DocumentSnapshot.class);
        when(existing.exists()).thenReturn(true);
        stubTransaction(existing);

        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.MERGE,
                Map.of("name", new FirestoreValue.StringValue("alice")),
                List.of(),
                null);

        assertThatThrownBy(() -> service.writeDocument("p", "d", "users/a", request).block())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("expectedUpdateTime");
    }

    @Test
    void writeDocumentReturns409StyleConflictOnStaleUpdateTime() {
        Instant actualUpdateTime = Instant.parse("2026-07-06T10:00:00Z");
        DocumentSnapshot existing = mock(DocumentSnapshot.class);
        when(existing.exists()).thenReturn(true);
        when(existing.getUpdateTime()).thenReturn(com.google.cloud.Timestamp.ofTimeSecondsAndNanos(
                actualUpdateTime.getEpochSecond(), actualUpdateTime.getNano()));
        when(existing.getData()).thenReturn(Map.of("name", "server-version"));
        when(existing.getId()).thenReturn("a");
        stubTransaction(existing);

        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.MERGE,
                Map.of("name", new FirestoreValue.StringValue("local-version")),
                List.of(),
                Instant.parse("2026-07-06T09:00:00Z"));

        assertThatThrownBy(() -> service.writeDocument("p", "d", "users/a", request).block())
                .isInstanceOf(OptimisticConcurrencyException.class)
                .satisfies(error -> {
                    DocumentDto latest = ((OptimisticConcurrencyException) error).getLatestDocument();
                    assertThat(latest).isNotNull();
                    assertThat(latest.updateTime()).isEqualTo(actualUpdateTime);
                    assertThat(latest.fields().get("name"))
                            .isEqualTo(new FirestoreValue.StringValue("server-version"));
                });
    }

    @Test
    void writeDocumentConflictsWhenExpectedDocumentWasDeleted() {
        DocumentSnapshot missing = mock(DocumentSnapshot.class);
        when(missing.exists()).thenReturn(false);
        stubTransaction(missing);

        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.MERGE,
                Map.of(),
                List.of(),
                Instant.parse("2026-07-06T09:00:00Z"));

        assertThatThrownBy(() -> service.writeDocument("p", "d", "users/a", request).block())
                .isInstanceOf(OptimisticConcurrencyException.class)
                .hasMessageContaining("no longer exists");
    }

    @Test
    void writeDocumentMergesAndReturnsLatestDocument() {
        DocumentSnapshot missing = mock(DocumentSnapshot.class);
        when(missing.exists()).thenReturn(false);
        Transaction transaction = stubTransaction(missing);

        DocumentSnapshot saved = mock(DocumentSnapshot.class);
        when(saved.exists()).thenReturn(true);
        when(saved.getData()).thenReturn(Map.of("age", 30L));
        Instant savedAt = Instant.parse("2026-07-06T11:00:00Z");
        when(saved.getUpdateTime()).thenReturn(com.google.cloud.Timestamp.ofTimeSecondsAndNanos(
                savedAt.getEpochSecond(), savedAt.getNano()));

        when(documentReference.get()).thenReturn(ApiFutures.immediateFuture(saved));
        when(documentReference.getId()).thenReturn("a");
        when(documentReference.listCollections()).thenReturn(List.of());

        DocumentWriteRequest request = new DocumentWriteRequest(
                DocumentWriteRequest.WriteMode.MERGE,
                Map.of("age", new FirestoreValue.IntegerValue(30L)),
                List.of("stale"),
                null);

        DocumentDto result = service.writeDocument("p", "d", "users/a", request).block();

        assertThat(result).isNotNull();
        assertThat(result.fields().get("age")).isEqualTo(new FirestoreValue.IntegerValue(30L));
        assertThat(result.updateTime()).isEqualTo(savedAt);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.captor();
        verify(transaction).set(eq(documentReference), payloadCaptor.capture(), any(SetOptions.class));
        assertThat(payloadCaptor.getValue().get("age")).isEqualTo(30L);
        assertThat(payloadCaptor.getValue().get("stale")).isEqualTo(FieldValue.delete());
    }

    private Transaction stubTransaction(DocumentSnapshot snapshotToReturn) {
        Transaction transaction = mock(Transaction.class);
        when(firestoreManagerService.getFirestore("p", "d")).thenReturn(firestore);
        when(firestore.document(anyString())).thenReturn(documentReference);
        when(transaction.get(documentReference))
                .thenReturn(ApiFutures.immediateFuture(snapshotToReturn));
        when(firestore.runTransaction(any())).thenAnswer(invocation -> {
            Transaction.Function<?> function = invocation.getArgument(0);
            try {
                return ApiFutures.immediateFuture(function.updateCallback(transaction));
            } catch (Exception e) {
                return ApiFutures.immediateFailedFuture(e);
            }
        });
        return transaction;
    }

    // ----------------------------------------------------------------- misc

    @Test
    void getAllCollectionsReturnsCollectionIds() {
        CollectionReference users = mock(CollectionReference.class);
        CollectionReference posts = mock(CollectionReference.class);
        when(users.getId()).thenReturn("users");
        when(posts.getId()).thenReturn("posts");
        when(firestoreManagerService.getFirestore("p", "d")).thenReturn(firestore);
        when(firestore.listCollections()).thenReturn(List.of(users, posts));

        List<String> collections = service.getAllCollections("p", "d").block();

        assertThat(collections).containsExactly("users", "posts");
    }
}
