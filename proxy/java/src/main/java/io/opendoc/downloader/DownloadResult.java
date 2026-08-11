package io.opendoc.downloader;

import java.net.URI;
import java.net.http.HttpHeaders;

public record DownloadResult(int status, HttpHeaders headers, byte[] body, URI sourceUri) {}
