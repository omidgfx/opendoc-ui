package io.opendoc.downloader;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DownloaderApplication {
    public static void main(String[] args) {
        String port = System.getenv("PORT");
        if (port != null && !port.isBlank()) System.setProperty("server.port", port);
        String bind = System.getenv("OPENDOC_BIND");
        if (bind != null && !bind.isBlank()) System.setProperty("server.address", bind);
        SpringApplication.run(DownloaderApplication.class, args);
    }
}
