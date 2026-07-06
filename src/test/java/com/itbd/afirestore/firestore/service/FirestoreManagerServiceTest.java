package com.itbd.afirestore.firestore.service;

import com.google.cloud.firestore.Firestore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * FFP-004: Firestore client lifecycle tests.
 *
 * Uses a synthetic service-account JSON with a freshly generated RSA key, so no
 * real credentials are involved and no network access happens (Firestore clients
 * connect lazily).
 */
class FirestoreManagerServiceTest {

    private static String serviceAccountJson;

    private FirestoreManagerService service;

    @BeforeAll
    static void createSyntheticServiceAccount() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair keyPair = generator.generateKeyPair();
        String privateKeyPem = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(keyPair.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
        serviceAccountJson = """
                {
                  "type": "service_account",
                  "project_id": "unit-test-project",
                  "private_key_id": "unit-test-key-id",
                  "private_key": "%s",
                  "client_email": "unit-test@unit-test-project.iam.gserviceaccount.com",
                  "client_id": "1234567890",
                  "token_uri": "https://oauth2.googleapis.com/token"
                }
                """.formatted(privateKeyPem.replace("\n", "\\n"));
    }

    @BeforeEach
    void setUp() {
        service = new FirestoreManagerService();
    }

    @AfterEach
    void tearDown() {
        service.disconnectAll();
    }

    @Test
    void initializeRegistersConnection() throws IOException {
        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);

        assertThat(service.isConnected("unit-test-project", "db-a")).isTrue();
        Firestore firestore = service.getFirestore("unit-test-project", "db-a");
        assertThat(firestore).isNotNull().isSameAs(service.getFirestore());

        Map<String, String> context = service.getActiveConnectionContext();
        assertThat(context).containsEntry("status", "connected")
                .containsEntry("projectId", "unit-test-project")
                .containsEntry("databaseId", "db-a");
    }

    @Test
    void reinitializationReplacesTheExistingClient() throws IOException {
        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);
        Firestore first = service.getFirestore("unit-test-project", "db-a");

        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);
        Firestore second = service.getFirestore("unit-test-project", "db-a");

        assertThat(second).isNotSameAs(first);
        assertThat(service.getFirestore()).isSameAs(second);
    }

    @Test
    void blankDatabaseIdNormalizesToDefault() throws IOException {
        service.initializeFirestore("unit-test-project", null, serviceAccountJson);

        assertThat(service.isConnected("unit-test-project", null)).isTrue();
        assertThat(service.isConnected("unit-test-project", "")).isTrue();
        assertThat(service.isConnected("unit-test-project", "  ")).isTrue();
        assertThat(service.getActiveConnectionContext()).containsEntry("databaseId", "(default)");
    }

    @Test
    void disconnectRemovesTheConnection() throws IOException {
        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);

        service.disconnect("unit-test-project", "db-a");

        assertThat(service.isConnected("unit-test-project", "db-a")).isFalse();
        assertThatThrownBy(() -> service.getFirestore("unit-test-project", "db-a"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.getFirestore())
                .isInstanceOf(IllegalStateException.class);
        assertThat(service.getActiveConnectionContext()).containsEntry("status", "disconnected");
    }

    @Test
    void disconnectingAnUnknownOrAlreadyClosedConnectionIsSafe() throws IOException {
        // No connections at all: activeConnectionKey is null (NPE regression guard).
        assertThatCode(() -> service.disconnect("unit-test-project", "db-a")).doesNotThrowAnyException();

        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);
        service.disconnectAll();
        assertThatCode(() -> service.disconnect("unit-test-project", "db-a")).doesNotThrowAnyException();
    }

    @Test
    void disconnectingTheActiveConnectionFallsBackToARemainingOne() throws IOException {
        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);
        service.initializeFirestore("unit-test-project", "db-b", serviceAccountJson);
        Firestore remaining = service.getFirestore("unit-test-project", "db-a");

        // db-b is the active connection; disconnecting it must fall back to db-a.
        service.disconnect("unit-test-project", "db-b");

        assertThat(service.isConnected("unit-test-project", "db-a")).isTrue();
        assertThat(service.getFirestore()).isSameAs(remaining);
        assertThat(service.getActiveConnectionContext()).containsEntry("status", "connected");
    }

    @Test
    void disconnectAllClosesEveryConnection() throws IOException {
        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);
        service.initializeFirestore("unit-test-project", "db-b", serviceAccountJson);

        service.disconnectAll();

        assertThat(service.isConnected("unit-test-project", "db-a")).isFalse();
        assertThat(service.isConnected("unit-test-project", "db-b")).isFalse();
        assertThat(service.getActiveConnectionMode()).isEqualTo("disconnected");
        assertThatThrownBy(() -> service.getFirestore()).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void destroyClosesAllConnectionsOnShutdown() throws IOException {
        service.initializeFirestore("unit-test-project", "db-a", serviceAccountJson);

        service.destroy();

        assertThat(service.isConnected("unit-test-project", "db-a")).isFalse();
        assertThat(service.getActiveConnectionContext()).containsEntry("status", "disconnected");
    }

    @Test
    void initializeRejectsInvalidCredentials() {
        assertThatThrownBy(() -> service.initializeFirestore("unit-test-project", "db-a", "not-json"))
                .isInstanceOf(IOException.class);
    }

    @Test
    void initializeRejectsBlankProjectId() {
        assertThatThrownBy(() -> service.initializeFirestore("  ", "db-a", serviceAccountJson))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
