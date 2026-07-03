package com.itbd.afirestore;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles({"test", "emulator"})
class FirestoreIntegrationTests {

    @Test
    void contextLoadsWithEmulator() {
        // Verifies Spring Boot context loads with Firestore emulator profile
        // This test requires a running Firestore emulator on localhost:8080
    }
}
