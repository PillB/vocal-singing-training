/** Verify the deployed static bytes, independently of a successful Pages job. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const hash = (body) => createHash("sha256").update(body).digest("hex");

async function bytes(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Deployment verification: HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function checkLiveRelease(root, url) {
  const base = new URL(url.endsWith("/") ? url : url + "/");
  const expected = hash(readFileSync(join(root, "index.html")));
  const actual = hash(await bytes(base.href));
  if (actual !== expected) throw new Error(`Deployment verification: index.html differs from the checked-out release (${expected} expected; ${actual} received). Wait for the correct Pages deployment/cache, then rerun.`);
  const manifest = JSON.parse(readFileSync(join(root, "qa/asset-manifest.json"), "utf8"));
  const entries = Object.entries(manifest);
  for (let at = 0; at < entries.length; at += 8) {
    await Promise.all(entries.slice(at, at + 8).map(async ([path, info]) => {
      const address = new URL(path + "?v=" + encodeURIComponent(info.v), base);
      const deployed = hash(await bytes(address.href)).slice(0, 16);
      if (deployed !== info.sha) throw new Error(`Deployment verification: ${path}?v=${info.v} hash differs (${info.sha} expected; ${deployed} received).`);
    }));
  }
  return { assets: entries.length, indexSha256: actual };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  checkLiveRelease(root, "https://pillb.github.io/vocal-singing-training/")
    .then((result) => console.log(`Live release verified: index.html and ${result.assets} versioned assets.`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
