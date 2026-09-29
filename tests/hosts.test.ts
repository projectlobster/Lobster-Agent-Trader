import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_SETTINGS, HOSTS } from "@/lib/store/settings";

const url = (id: string) => HOSTS.find((host) => host.id === id)?.url;

test("both Lighter and Robinhood deployments are offered", () => {
  // The kit resolves deployments purely from LIGHTER_HOST, so this list is the
  // whole of the app's notion of "which exchange" — a missing entry here means
  // a deployment is unreachable from the UI.
  assert.equal(url("lighter-mainnet"), "https://mainnet.zklighter.elliot.ai");
  assert.equal(url("lighter-testnet"), "https://testnet.zklighter.elliot.ai");
  assert.equal(url("robinhood-mainnet"), "https://api.rh.lighter.xyz");
  assert.equal(url("robinhood-testnet"), "https://api.rh-testnet.lighter.xyz");
});

test("each deployment has a distinct id, label and https url", () => {
  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const host of HOSTS) {
    assert.ok(host.id.length > 0, "every host needs an id");
    assert.ok(host.label.length > 0, `${host.id} needs a label`);
    assert.match(host.url, /^https:\/\//, `${host.id} must be https, not ${host.url}`);

    assert.equal(ids.has(host.id), false, `duplicate id: ${host.id}`);
    assert.equal(urls.has(host.url), false, `duplicate url: ${host.url}`);
    ids.add(host.id);
    urls.add(host.url);
  }
});

test("the default deployment is one of the offered ones", () => {
  assert.ok(
    HOSTS.some((host) => host.url === DEFAULT_SETTINGS.kit.host),
    `default ${DEFAULT_SETTINGS.kit.host} is not in the HOSTS list`,
  );
});

test("Lighter and Robinhood are labelled distinctly enough to tell apart", () => {
  // Both render in one dropdown; "Lighter mainnet" and "Robinhood Lighter"
  // would be indistinguishable if the venue were not in the label.
  for (const host of HOSTS) {
    assert.ok(
      /Lighter|Robinhood/i.test(host.label),
      `${host.id} label "${host.label}" does not name a venue`,
    );
  }

  const labels = HOSTS.map((host) => host.label);
  assert.equal(new Set(labels).size, labels.length, "labels must be unique");
});
