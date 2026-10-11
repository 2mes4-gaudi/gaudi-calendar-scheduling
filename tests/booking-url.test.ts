import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingUrl } from "../dist/domain/services/booking-url.js";

const defaults = { publicUrl: "https://cal.apps.ona.gaudi.2mes4.com", defaultUsername: "ona", defaultTimeZone: "Europe/Madrid" };

test("booking-url: mínim amb username per defecte i timezone per defecte", () => {
  const r = buildBookingUrl({ eventSlug: "30min" }, defaults);
  assert.equal(r.url, "https://cal.apps.ona.gaudi.2mes4.com/ona/30min?timeZone=Europe%2FMadrid");
  assert.equal(r.path, "/ona/30min");
  assert.equal(r.username, "ona");
  assert.equal(r.params.timeZone, "Europe/Madrid");
});

test("booking-url: totes les opcions (mes, dia, slot, durada, prefill, layout, embed, tema, metadata)", () => {
  const r = buildBookingUrl(
    {
      eventSlug: "consultoria",
      username: "eric",
      month: "2026-11",
      date: "2026-11-03",
      slot: "2026-11-03T09:00:00.000Z",
      timeZone: "America/New_York",
      duration: 45,
      name: "Anna",
      email: "anna@example.com",
      guests: ["marc@example.com", "joan@example.com"],
      notes: "Primera reunió",
      layout: "month_view",
      embed: "embed",
      embedType: "inline",
      theme: "dark",
      metadata: { origen: "agent", uid: "42" },
    },
    defaults
  );
  assert.equal(r.path, "/eric/consultoria");
  assert.match(r.url, /^https:\/\/cal\.apps\.ona\.gaudi\.2mes4\.com\/eric\/consultoria\?/);
  assert.match(r.url, /month=2026-11/);
  assert.match(r.url, /date=2026-11-03/);
  assert.match(r.url, /slot=2026-11-03T09%3A00%3A00\.000Z/);
  assert.match(r.url, /timeZone=America%2FNew_York/);
  assert.match(r.url, /duration=45/);
  assert.match(r.url, /name=Anna/);
  assert.match(r.url, /email=anna%40example\.com/);
  assert.match(r.url, /guests=marc%40example\.com&guests=joan%40example\.com/);
  assert.match(r.url, /notes=Primera\+reuni%C3%B3/);
  assert.match(r.url, /layout=month_view/);
  assert.match(r.url, /embed=embed/);
  assert.match(r.url, /embedType=inline/);
  assert.match(r.url, /theme=dark/);
  assert.match(r.url, /metadata%5Borigen%5D=agent/);
  assert.match(r.url, /metadata%5Buid%5D=42/);
});

test("booking-url: equip (/team/<slug>/<event>) i organització", () => {
  const team = buildBookingUrl({ eventSlug: "demo", teamSlug: "suport" }, defaults);
  assert.equal(team.path, "/team/suport/demo");

  const orgUser = buildBookingUrl({ eventSlug: "demo", organizationSlug: "acme", username: "eric" }, defaults);
  assert.equal(orgUser.path, "/acme/eric/demo");

  const orgTeam = buildBookingUrl({ eventSlug: "demo", organizationSlug: "acme", teamSlug: "suport" }, defaults);
  assert.equal(orgTeam.path, "/acme/team/suport/demo");
});

test("booking-url: baseUrl custom (local) i error sense username ni equip", () => {
  const local = buildBookingUrl({ eventSlug: "30min", username: "ona", baseUrl: "http://localhost:3000/" }, defaults);
  assert.ok(local.url.startsWith("http://localhost:3000/ona/30min?"));

  assert.throws(() => buildBookingUrl({ eventSlug: "30min" }, { publicUrl: "https://x.test" }), /username|teamSlug/);
});
