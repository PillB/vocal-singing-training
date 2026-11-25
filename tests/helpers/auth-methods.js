/** Isolate layout tests from the live worker's origin policy and latency. */
async function stubAuthMethods(target) {
  await target.route("**/v1/auth/methods", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ email: false, google: false, googleClientId: null, trialDays: 7 })
  }));
}

module.exports = { stubAuthMethods };
