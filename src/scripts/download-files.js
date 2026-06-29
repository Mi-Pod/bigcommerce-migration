const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const readline = require("readline");

const CSV_PATH = path.join(__dirname, "../../exports/content/files/index.csv");
const DEST_ROOT = "E:\\vaping-usa";
const CONCURRENCY = 5;

const TYPE_DIR = {
  MediaImage: "images",
  Video: "videos",
  GenericFile: "files",
};

// Parse a single CSV row, respecting double-quoted fields.
function parseCsvRow(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// Extract the bare filename from a CDN URL (strips query params).
function filenameFromUrl(url) {
  return path.basename(url.split("?")[0]);
}

// Build the destination path: DEST_ROOT/{YYYY}/{MM}/{type}/{filename}
function buildDestPath(createdAt, fileType, url) {
  const d = new Date(createdAt);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const typeDir = TYPE_DIR[fileType] || "files";
  const filename = filenameFromUrl(url);
  return path.join(DEST_ROOT, year, month, typeDir, filename);
}

// Download url to destPath, following one level of redirects.
function downloadFile(url, destPath, depth = 0) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && depth < 3) {
        res.resume();
        return downloadFile(res.headers.location, destPath, depth + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const tmp = destPath + ".tmp";
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on("finish", () => {
        out.close(() => {
          fs.renameSync(tmp, destPath);
          resolve();
        });
      });
      out.on("error", (err) => {
        try { fs.unlinkSync(tmp); } catch {}
        reject(err);
      });
    });
    req.on("error", reject);
    req.setTimeout(60000, () => { req.destroy(new Error("timeout")); });
  });
}

// Worker-queue concurrency: `limit` workers each pull one item at a time.
// Never accumulates all promises — O(limit) memory for in-flight work.
async function withConcurrency(items, limit, fn) {
  let i = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      try {
        const status = await fn(item);
        if (status === "skip") skipped++;
        else succeeded++;
      } catch (err) {
        failed++;
        process.stdout.write(`\n  ✗ ${item.filename} — ${err.message}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return { succeeded, failed, skipped };
}

async function main() {
  console.log(`Reading CSV: ${CSV_PATH}`);

  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(CSV_PATH), crlfDelay: Infinity });
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;
    const [id, alt, fileType, mimeType, fileStatus, url, createdAt] = parseCsvRow(line);

    // Skip non-ready files
    if (fileStatus !== "READY") continue;

    // Skip Invoice SIV GenericFiles
    if (fileType === "GenericFile" && alt.startsWith("Invoice SIV")) continue;

    // Skip rows with no usable URL
    if (!url || !url.startsWith("http")) continue;

    const destPath = buildDestPath(createdAt, fileType, url);
    const filename = path.basename(destPath);
    rows.push({ id, alt, fileType, url, createdAt, destPath, filename });
  }

  console.log(`Found ${rows.length} files to download (Invoice SIV and non-READY omitted)`);

  let alreadyDone = 0;
  const toDownload = rows.filter((r) => {
    if (fs.existsSync(r.destPath)) { alreadyDone++; return false; }
    return true;
  });

  console.log(`Already on disk: ${alreadyDone}  |  To download: ${toDownload.length}`);
  if (!toDownload.length) {
    console.log("Nothing to do.");
    return;
  }

  let done = 0;
  const total = toDownload.length;
  const interval = Math.max(1, Math.floor(total / 100));

  const { succeeded, failed, skipped } = await withConcurrency(toDownload, CONCURRENCY, async (item) => {
    // Re-check existence in case a concurrent task already wrote this path
    if (fs.existsSync(item.destPath)) return "skip";
    await downloadFile(item.url, item.destPath);
    done++;
    if (done % interval === 0 || done === total) {
      process.stdout.write(`\r  ${done}/${total} (${Math.round((done / total) * 100)}%)`);
    }
  });

  console.log(`\n\nDone — ${succeeded} downloaded, ${skipped} skipped (already existed), ${failed} failed`);
  console.log(`Files saved to: ${DEST_ROOT}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
