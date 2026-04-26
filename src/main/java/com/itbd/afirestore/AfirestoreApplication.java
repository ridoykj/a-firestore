package com.itbd.afirestore;

import com.google.cloud.spring.autoconfigure.core.GcpContextAutoConfiguration;
import com.google.cloud.spring.autoconfigure.firestore.FirestoreRepositoriesAutoConfiguration;
import com.google.cloud.spring.autoconfigure.firestore.FirestoreTransactionManagerAutoConfiguration;
import com.google.cloud.spring.autoconfigure.firestore.GcpFirestoreAutoConfiguration;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = {
	GcpFirestoreAutoConfiguration.class,
	GcpContextAutoConfiguration.class,
	FirestoreTransactionManagerAutoConfiguration.class,
	FirestoreRepositoriesAutoConfiguration.class
})
public class AfirestoreApplication {

	public static void main(String[] args) {
		SpringApplication.run(AfirestoreApplication.class, args);
	}

}
