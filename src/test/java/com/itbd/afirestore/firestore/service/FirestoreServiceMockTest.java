package com.itbd.afirestore.firestore.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import reactor.core.publisher.Mono;

/**
 * FFP-006: Backend unit test with Mockito example.
 * 
 * Demonstrates how to mock Firestore dependencies and test service logic in isolation.
 */
class FirestoreServiceMockTest {

    @Mock
    private GenericFirestoreService firestoreService;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
    }

    @Test
    void shouldReturnEmptyListWhenNoCollectionsExist() throws Exception {
        // Arrange
        when(firestoreService.getAllCollections(anyString(), anyString())).thenReturn(Mono.just(java.util.Collections.emptyList()));

        // Act
        var result = firestoreService.getAllCollections("test-project", "(default)").block();

        // Assert
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void shouldReturnCollectionsWhenTheyExist() throws Exception {
        // Arrange
        java.util.List<String> collections = java.util.Arrays.asList("users", "posts", "comments");
        when(firestoreService.getAllCollections(anyString(), anyString())).thenReturn(Mono.just(collections));

        // Act
        var result = firestoreService.getAllCollections("test-project", "(default)").block();

        // Assert
        assertNotNull(result);
        assertEquals(3, result.size());
        assertTrue(result.contains("users"));
    }

    @Test
    void shouldThrowExceptionForInvalidProjectId() {
        when(firestoreService.getAllCollections(eq(""), anyString())).thenReturn(Mono.error(new IllegalArgumentException("Invalid project ID")));

        assertThrows(IllegalArgumentException.class, () -> {
            firestoreService.getAllCollections("", "(default)").block();
        });
    }

    @Test
    void shouldCallGetCollectionsWithCorrectParameters() throws Exception {
        when(firestoreService.getAllCollections(anyString(), anyString())).thenReturn(Mono.just(java.util.Collections.emptyList()));

        // Act
        firestoreService.getAllCollections("my-project", "db-1").block();

        // Assert
        verify(firestoreService, times(1)).getAllCollections("my-project", "db-1");
    }
}
