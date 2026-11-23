/**
 * The block of addresses a throttle counts one caller by (`addressBlock`): an
 * IPv4 address is itself, an IPv6 address is its /56, and an IPv4-mapped
 * address is the IPv4 address it maps. Each expectation has a twin that a
 * wrong parse would get right, so a parser that only handles the easy
 * spelling, keys by /64, or masks mapped IPv4 addresses fails here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { addressBlock } from "../src/db.js";

test("every spelling of one IPv6 /56 is one block", () => {
  const block = "2001:db8:aa:1100::/56";
  for (const ip of [
    "2001:db8:aa:1100::1",
    "2001:0db8:00aa:1100:0000:0000:0000:0001",
    "2001:DB8:AA:11FF:ffff:ffff:ffff:ffff",
    "2001:db8:aa:1134:1:2:3:4",
    "2001:db8:aa:11ab::",
    "2001:db8:aa:1100::1%eth0"
  ]) {
    assert.equal(addressBlock(ip), block, ip);
  }
  // The neighbours either side are other people's.
  assert.equal(addressBlock("2001:db8:aa:1200::1"), "2001:db8:aa:1200::/56");
  assert.equal(addressBlock("2001:db8:aa:10ff::1"), "2001:db8:aa:1000::/56");
  assert.equal(addressBlock("2001:db8:ab:1100::1"), "2001:db8:ab:1100::/56");
});

test("the compressed form is expanded where it stands, not at the end", () => {
  // `::` in the middle: a parser that pads at the end reads 2001:db8:0:0 as 2001:db8:5:6.
  assert.equal(addressBlock("2001:db8::5:6"), "2001:db8:0:0::/56");
  assert.equal(addressBlock("::1"), "0:0:0:0::/56");
  assert.equal(addressBlock("fe80::"), "fe80:0:0:0::/56");
  assert.equal(addressBlock("1:2:3:4:5:6:7::"), "1:2:3:0::/56");
});

test("an IPv4-mapped address is the IPv4 address it maps, never the /56 they all share", () => {
  assert.equal(addressBlock("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(addressBlock("::FFFF:192.0.2.1"), "192.0.2.1");
  assert.equal(addressBlock("::ffff:c000:201"), "192.0.2.1", "the same address in hex");
  assert.equal(addressBlock("0:0:0:0:0:ffff:198.51.100.200"), "198.51.100.200");
  assert.notEqual(addressBlock("::ffff:192.0.2.1"), addressBlock("::ffff:192.0.2.2"), "two IPv4 clients, two buckets");
  // Control: a dotted tail on an address that is not mapped is just IPv6 (the IPv4-compatible form, and NAT64).
  assert.equal(addressBlock("64:ff9b::192.0.2.1"), "64:ff9b:0:0::/56");
});

test("IPv4, and anything that is not an address, is kept whole", () => {
  for (const ip of ["192.0.2.1", "unknown", "", "1:2:3", "1::2::3", "1:2:3:4:5:6:7:8:9", "12345::1", "g::1", "::ffff:300.0.2.1", "1:::2"]) {
    assert.equal(addressBlock(ip), ip, JSON.stringify(ip));
  }
  assert.equal(addressBlock(undefined), undefined);
});
