package io.opendoc.proxyagent;

public final class ProxyAgentException extends RuntimeException {
    private final String code;
    private final int status;

    public ProxyAgentException(String code, String message, int status) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public ProxyAgentException(String code, String message, int status, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.status = status;
    }

    public String code() {
        return code;
    }

    public int status() {
        return status;
    }
}
