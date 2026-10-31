import { useRef, useState } from "react";
import { Modal, Field } from "./ui";
import { configureShopConnection, exportShopConnection } from "./cloud";
export function ConnectionSetup({
  onClose,
  onReady,
}: {
  onClose: () => void;
  onReady: () => void;
}) {
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Hubungkan database toko"
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (working) return;
          setWorking(true);
          setError("");
          try {
            await configureShopConnection(code);
            onReady();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Koneksi belum berhasil. Coba lagi.",
            );
          } finally {
            setWorking(false);
          }
        }}
      >
        <div className="confirm-body">
          <p>
            Hubungkan perangkat ini sekali. Tempel kode dari perangkat toko yang
            sudah terhubung, atau pilih file koneksi toko.
          </p>
          <p>
            Setelah terhubung, aplikasi mengambil data toko yang sama. CSV di
            perangkat ini tetap tersimpan.
          </p>
          <Field label="Kode koneksi toko">
            <textarea
              rows={4}
              autoComplete="off"
              spellCheck={false}
              value={code}
              disabled={working}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="Pilih file koneksi (.txt)">
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={working}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError("");
                if (file.size > 8192) {
                  setError(
                    "File koneksi terlalu besar. Pilih file kode koneksi toko, bukan backup CSV.",
                  );
                  return;
                }
                try {
                  setCode((await file.text()).trim());
                } catch {
                  setError("File koneksi belum dapat dibaca.");
                }
              }}
            />
          </Field>
          {error && (
            <p className="stock-error" role="alert">
              {error}
            </p>
          )}
          {working && <p role="status">Memeriksa koneksi toko…</p>}
        </div>
        <footer className="modal-footer">
          <button type="button" disabled={working} onClick={onClose}>
            Batal
          </button>
          <button className="primary" disabled={working || !code.trim()}>
            Hubungkan & lanjutkan
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function ConnectionShare({ onClose }: { onClose: () => void }) {
  const [code] = useState(() => exportShopConnection());
  const [notice, setNotice] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <Modal title="Hubungkan perangkat lain" onClose={onClose}>
      <div className="confirm-body">
        <p>
          Di HP atau perangkat lain, pilih{" "}
          <strong>Gunakan database toko</strong>, lalu tempel kode ini. Lakukan
          setelah data desktop berhasil disync.
        </p>
        <Field label="Kode koneksi perangkat lain">
          <textarea
            ref={field}
            rows={4}
            readOnly
            spellCheck={false}
            value={code}
            onFocus={(e) => e.target.select()}
          />
        </Field>
        <p className="form-note">
          Kode ini memberi akses data toko. Kirim hanya ke perangkat tokomu.
        </p>
        {notice && <p role="status">{notice}</p>}
      </div>
      <footer className="modal-footer">
        <button onClick={onClose}>Tutup</button>
        <button
          className="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setNotice("Kode tersalin. Tempel pada perangkat toko lainnya.");
            } catch {
              field.current?.select();
              setNotice("Kode sudah dipilih. Salin dengan menu perangkatmu.");
            }
          }}
        >
          Salin kode koneksi
        </button>
      </footer>
    </Modal>
  );
}
