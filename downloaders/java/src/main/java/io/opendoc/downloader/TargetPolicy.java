package io.opendoc.downloader;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.List;

public final class TargetPolicy {
    private TargetPolicy() {}

    public static ResolvedTarget validate(URI target, DownloaderConfig config) {
        String scheme = target.getScheme() == null ? "" : target.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https"))
            throw new DownloaderException("TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", 400);
        if (target.getUserInfo() != null)
            throw new DownloaderException("TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", 400);
        String host = target.getHost() == null ? "" : target.getHost().toLowerCase();
        if (host.isBlank() || host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local"))
            throw new DownloaderException("TARGET_HOST_BLOCKED", "Local hostnames are blocked.", 403);
        if (!hostAllowed(host, config.allowedHosts()))
            throw new DownloaderException("TARGET_HOST_NOT_ALLOWED", "The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.", 403);
        int port = target.getPort() >= 0 ? target.getPort() : scheme.equals("https") ? 443 : 80;
        if (!config.allowedPorts().contains(port))
            throw new DownloaderException("TARGET_PORT_BLOCKED", "Remote port " + port + " is not allowed.", 403);
        try {
            InetAddress[] addresses = InetAddress.getAllByName(host);
            if (addresses.length == 0)
                throw new DownloaderException("TARGET_DNS_FAILED", "The target hostname could not be resolved.", 502);
            for (InetAddress address : addresses) {
                if (!isPublic(address))
                    throw new DownloaderException(
                            "TARGET_ADDRESS_BLOCKED",
                            "The target resolves to a private, reserved, or otherwise prohibited address.",
                            403);
            }
            return new ResolvedTarget(target, host, port, List.of(addresses));
        } catch (UnknownHostException error) {
            throw new DownloaderException("TARGET_DNS_FAILED", "The target hostname could not be resolved.", 502, error);
        }
    }

    public static boolean isPublic(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) return false;
        byte[] bytes = address.getAddress();
        if (address instanceof Inet4Address) {
            int first = Byte.toUnsignedInt(bytes[0]);
            int second = Byte.toUnsignedInt(bytes[1]);
            int third = Byte.toUnsignedInt(bytes[2]);
            if (first == 0 || first == 127 || first >= 224) return false;
            if (first == 100 && second >= 64 && second <= 127) return false;
            if (first == 192 && second == 0 && (third == 0 || third == 2)) return false;
            if (first == 198 && (second == 18 || second == 19 || second == 51 && third == 100)) return false;
            return !(first == 203 && second == 0 && third == 113);
        }
        if (address instanceof Inet6Address) {
            if ((Byte.toUnsignedInt(bytes[0]) & 0xfe) == 0xfc) return false;
            return !(Byte.toUnsignedInt(bytes[0]) == 0x20
                    && Byte.toUnsignedInt(bytes[1]) == 0x01
                    && Byte.toUnsignedInt(bytes[2]) == 0x0d
                    && Byte.toUnsignedInt(bytes[3]) == 0xb8);
        }
        return false;
    }

    static boolean hostAllowed(String host, List<String> patterns) {
        if (patterns.isEmpty()) return true;
        return patterns.stream().anyMatch(pattern ->
                pattern.startsWith("*.")
                        ? host.endsWith(pattern.substring(1)) && host.length() > pattern.length() - 1
                        : host.equals(pattern));
    }

    public record ResolvedTarget(URI uri, String host, int port, List<InetAddress> addresses) {}
}
