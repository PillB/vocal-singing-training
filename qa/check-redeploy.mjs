/**
 * Does the redeploy script read a worker's health correctly?
 *
 * workers/entitlements/scripts/redeploy.sh refuses to go on when the worker
 * answers wrongly, which means its reading of /v1/health is load-bearing: a
 * script that mistakes "this field is missing" for "this feature is off" would
 * either stop a good deploy or wave through a broken one. The deploy commands
 * themselves need a Cloudflare account and cannot be tested here, so this runs
 * the one part that can be: `--check`, against a stub serving each shape of
 * answer a real worker can give.
 *
 * Run: node qa/check-redeploy.mjs
 * Exit 0 and REDEPLOY_CHECK_PASS, or exit 1 and what differed.
 */
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "workers", "entitlements", "scripts", "redeploy.sh");

/** A worker as it answers after this redeploy: everything on, 7-day trial. */
const CURRENT = {
  ok: true,
  stripeConfigured: false,
  mercadopagoConfigured: false,
  signingKeyConfigured: true,
  accountsConfigured: true,
  eventsEnabled: true,
  reportsEnabled: true,
  authMethods: { email: false, google: true, googleClientId: "x.apps.googleusercontent.com", trialDays: 7 },
  siteOrigin: "https://pillb.github.io"
};

/** The worker live today: older than the statistics and the reports route. */
const OLD = {
  ok: true,
  stripeConfigured: false,
  mercadopagoConfigured: false,
  signingKeyConfigured: true,
  accountsConfigured: true,
  authMethods: { email: false, google: true, googleClientId: "x.apps.googleusercontent.com", trialDays: 30 },
  siteOrigin: "https://pillb.github.io"
};

/** Stage 1 of the redeploy: new code, statistics deliberately off. */
const STAGE_ONE = { ...CURRENT, eventsEnabled: false };

/**
 * Serve one fixed answer on /v1/health.
 * @param {Object|string|null} body Object to send as JSON, raw string, or null
 *   to answer 500.
 * @returns {Promise<{url: string, close: () => Promise<void>}>} The stub.
 */
function stub(body) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (!req.url.startsWith("/v1/health")) {
        res.writeHead(404).end("no");
        return;
      }
      if (body === null) {
        res.writeHead(500).end("boom");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

/**
 * Run the script against a URL.
 * @param {string} url Worker base URL.
 * @param {string[]} [args] Arguments, defaulting to `--check`.
 * @param {Object} [env] Extra environment.
 * @returns {Promise<{code: number, out: string}>} Exit code and plain output.
 */
function run(url, args, env) {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [SCRIPT, ...(args || ["--check"])],
      { env: { ...process.env, VT_WORKER_URL: url, TERM: "dumb", ...(env || {}) }, timeout: 60000 },
      (error, stdout, stderr) => {
        // Strip the colour the script writes for a human reader.
        const out = `${stdout}${stderr}`.replace(/\u001b\[[0-9;]*m/g, "");
        resolve({ code: error && typeof error.code === "number" ? error.code : 0, out });
      }
    );
  });
}

const check = (url) => run(url);

const failures = [];

/**
 * @param {string} what The claim being checked.
 * @param {boolean} held Whether it held.
 * @param {string} [detail] What was seen instead.
 */
function expect(what, held, detail) {
  if (held) {
    console.log(`ok   ${what}`);
  } else {
    failures.push(`${what}${detail ? ` — ${detail}` : ""}`);
    console.log(`FAIL ${what}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  // 1. The worker as it will answer once this redeploy is done.
  {
    const s = await stub(CURRENT);
    const { code, out } = await check(s.url);
    await s.close();
    expect("a fully deployed worker checks clean", code === 0, `exit ${code}`);
    expect("it names the statistics as on", /anonymous statistics: on/.test(out), out);
    expect("it names the reports route as on", /problem reports: on/.test(out), out);
    expect("it reads the trial as 7 days", /free trial: 7 days/.test(out), out);
    expect("it says nothing was deployed", /Nothing was deployed/.test(out), out);
    expect("it never prints the machine-readable line", !/HEALTH \{/.test(out), out);
  }

  // 2. The worker live today. A missing field must read as "older than the
  //    field", never as "off": that difference is the whole point of the
  //    redeploy, and reading it as "off" would make a stale worker look
  //    deliberately configured.
  {
    const s = await stub(OLD);
    const { code, out } = await check(s.url);
    await s.close();
    expect("an older worker still exits 0 on --check", code === 0, `exit ${code}`);
    expect(
      "a missing eventsEnabled reads as not reported, not as off",
      /anonymous statistics: not reported/.test(out),
      out
    );
    expect(
      "a missing reportsEnabled reads as not reported, not as off",
      /problem reports: not reported/.test(out),
      out
    );
    expect("a 30-day trial is shown as it is", /free trial: 30 days/.test(out), out);
  }

  // 3. Stage 1: events off on purpose. "off" and "not reported" must not look
  //    the same, or stage 1 cannot be told apart from a worker that is too old.
  {
    const s = await stub(STAGE_ONE);
    const { code, out } = await check(s.url);
    await s.close();
    expect("stage 1 checks clean", code === 0, `exit ${code}`);
    expect("statistics switched off read as off", /anonymous statistics: off/.test(out), out);
    expect("and not as not reported", !/anonymous statistics: not reported/.test(out), out);
  }

  // 4. A worker that answers something that is not JSON.
  {
    const s = await stub("<html>Cloudflare error 1101</html>");
    const { out } = await check(s.url);
    await s.close();
    expect("a non-JSON answer is called out", /was not JSON/.test(out), out);
  }

  // 5. A worker that is down. The script must say so rather than printing a
  //    row of cheerful "off" lines.
  {
    const s = await stub(null);
    const { out } = await check(s.url);
    await s.close();
    expect("a failing worker is reported as not answering", /did not answer/.test(out), out);
    expect("and no feature is claimed either way", !/anonymous statistics:/.test(out), out);
  }

  // 6. Nothing listening at all.
  {
    const { out } = await check("http://127.0.0.1:1");
    expect("an unreachable worker is reported too", /did not answer/.test(out), out);
  }

  // 7. The gate both deploys hang on. Each deploy goes on only when one field
  //    of /v1/health has the value that deploy was meant to produce, so this
  //    has to say yes when it is right and no when it is not. A probe that
  //    always passed would turn the whole script into theatre.
  {
    const s = await stub(CURRENT);
    const held = await run(s.url, ["--probe", "events", "true"], { VT_PROBE_TRIES: "2" });
    const refused = await run(s.url, ["--probe", "events", "false"], { VT_PROBE_TRIES: "2" });
    const signing = await run(s.url, ["--probe", "signing", "true"], { VT_PROBE_TRIES: "2" });
    const days = await run(s.url, ["--probe", "trialDays", "7"], { VT_PROBE_TRIES: "2" });
    await s.close();
    expect("the probe passes on the value the deploy aimed for", held.code === 0, held.out);
    expect("the probe refuses the value it did not get", refused.code === 1, refused.out);
    expect("it reads a boolean field", signing.code === 0, signing.out);
    expect("and a number field", days.code === 0, days.out);
  }

  // 8. The same probe against a worker that is down: never a pass. A deploy
  //    that treats an unreachable worker as proof of success is worse than one
  //    with no check at all.
  {
    const s = await stub(null);
    const down = await run(s.url, ["--probe", "events", "true"], { VT_PROBE_TRIES: "2" });
    await s.close();
    expect("a worker that is down never passes the probe", down.code === 1, down.out);
    const missing = await run("http://127.0.0.1:1", ["--probe", "events", "true"], { VT_PROBE_TRIES: "2" });
    expect("nor does one that is not there", missing.code === 1, missing.out);
  }

  // 9. An older worker, probed for a field it does not report. "Not reported"
  //    must not satisfy a probe for false, or stage 1 would look done on a
  //    worker that never got the new code.
  {
    const s = await stub(OLD);
    const off = await run(s.url, ["--probe", "events", "false"], { VT_PROBE_TRIES: "2" });
    await s.close();
    expect("a missing field does not satisfy a probe for false", off.code === 1, off.out);
  }

  // 10. --help explains itself without needing an account or a network.
  {
    const help = await new Promise((resolve) => {
      execFile("bash", [SCRIPT, "--help"], { timeout: 30000 }, (error, stdout) =>
        resolve(`${stdout}`)
      );
    });
    expect("--help names both deploys", /two deploys/.test(help), help.slice(0, 200));
    expect("--help names --check", /--check/.test(help), help.slice(0, 200));
  }

  if (failures.length) {
    console.log(`\nREDEPLOY_CHECK_FAIL ${failures.length}`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nREDEPLOY_CHECK_PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
