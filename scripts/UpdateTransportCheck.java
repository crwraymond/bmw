import local.tokooffline.app.UpdateTransport;
import java.io.*;
import java.nio.file.*;
import java.security.*;

public class UpdateTransportCheck {
    interface Attempt { void run() throws Exception; }
    static void fails(String name, Attempt attempt) throws Exception {
        try { attempt.run(); } catch (IOException expected) { System.out.println("PASS " + name); return; }
        throw new AssertionError("Expected failure: " + name);
    }
    public static void main(String[] args) throws Exception {
        String base = args[0];
        File file = Files.createTempFile("toko-update-test", ".apk").toFile();
        try {
            if (!UpdateTransport.manifest(base + "/latest.json").contains("0.2.42")) throw new AssertionError("Wrong manifest");
            fails("missing release is an error", () -> UpdateTransport.manifest(base + "/missing.json"));
            UpdateTransport.download(base + "/package.apk", file, 11);
            StringBuilder hash = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest("apk-fixture".getBytes("UTF-8"))) hash.append(String.format("%02x", value));
            UpdateTransport.verifyHash(file, 11, hash.toString());
            System.out.println("PASS complete download verifies");
            fails("tampered APK", () -> UpdateTransport.verifyHash(file, 11, new String(new char[64]).replace('\0', '0')));
            fails("oversized download", () -> UpdateTransport.download(base + "/oversize.apk", file, 11));
            UpdateTransport.download(base + "/truncated.apk", file, 11);
            fails("truncated APK", () -> UpdateTransport.verifyHash(file, 11, hash.toString()));
            fails("server error", () -> UpdateTransport.download(base + "/failure.apk", file, 11));
        } finally { file.delete(); }
    }
}
