package io.opendoc.aigateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class GatewayApplication {
    public static void main(String[] args) {
        String port = System.getenv("PORT");
        if (port != null && !port.isBlank()) System.setProperty("server.port", port);
        String bind = System.getenv("AI_GATEWAY_BIND");
        if (bind != null && !bind.isBlank()) System.setProperty("server.address", bind);
        SpringApplication.run(GatewayApplication.class, args);
    }
}
