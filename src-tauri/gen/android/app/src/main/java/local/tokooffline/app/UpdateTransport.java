package local.tokooffline.app;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;

/** Bounded update transport, shared by the Android plugin and JVM contract tests. */
public final class UpdateTransport {
    private static HttpURLConnection connection(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "Toko-Offline-Android");
        conn.setRequestProperty("Cache-Control", "no-cache");
        return conn;
    }
    private static void copy(InputStream input, OutputStream output, long limit) throws IOException {
        byte[] buffer = new byte[65536];
        long total = 0;
        for (int count; (count = input.read(buffer)) != -1;) {
            total += count;
            if (total > limit) throw new IOException("Ukuran unduhan melebihi manifest");
            output.write(buffer, 0, count);
        }
    }
    private static void success(HttpURLConnection conn) throws IOException {
        if (conn.getResponseCode() != 200) throw new IOException("Rilis GitHub belum dapat diakses (HTTP " + conn.getResponseCode() + ")");
    }
    public static String manifest(String url) throws IOException {
        HttpURLConnection conn = connection(url);
        try {
            success(conn);
            try (InputStream input = conn.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                copy(input, output, 1024 * 1024);
                return new String(output.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally { conn.disconnect(); }
    }
    public static void download(String url, File destination, long size) throws IOException {
        if (size < 1 || size > 200L * 1024 * 1024) throw new IOException("Ukuran update tidak valid");
        HttpURLConnection conn = connection(url);
        try {
            success(conn);
            try (InputStream input = conn.getInputStream(); OutputStream output = new FileOutputStream(destination)) { copy(input, output, size); }
        } finally { conn.disconnect(); }
    }
    public static void verifyHash(File file, long size, String hash) throws IOException, NoSuchAlgorithmException {
        if (!file.isFile() || file.length() != size || !hash.matches("[0-9a-f]{64}")) throw new IOException("Verifikasi unduhan APK gagal");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            for (int count; (count = input.read(buffer)) != -1;) digest.update(buffer, 0, count);
        }
        StringBuilder actual = new StringBuilder();
        for (byte value : digest.digest()) actual.append(String.format("%02x", value));
        if (!actual.toString().equals(hash)) throw new IOException("Verifikasi unduhan APK gagal");
    }
}
