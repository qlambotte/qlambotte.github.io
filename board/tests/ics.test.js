/* Tests de ics.js : node tests/ics.test.js */
var assert = require("assert"), ics = require("../js/ics.js");
var n = 0;
function t(nom, f) { try { f(); n++; console.log("ok  " + nom); } catch (e) { console.log("ÉCHEC " + nom + "\n  " + e.message); process.exitCode = 1; } }
function heure(ms) { var l = ics.local(ms); return l.ymd + " " + (l.h < 10 ? "0" : "") + l.h + ":" + (l.mi < 10 ? "0" : "") + l.mi; }
var DE = Date.UTC(2026, 9, 1), A = Date.UTC(2026, 11, 31);
var ENTETE = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n", PIED = "END:VCALENDAR\r\n";
function cal(corps) { return ENTETE + corps + PIED; }

t("heure en UTC (Z) convertie à Bruxelles (heure d'été puis d'hiver)", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261022T083000Z\r\nDTEND:20261022T093000Z\r\nSUMMARY:Réunion\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART:20261201T083000Z\r\nDTEND:20261201T093000Z\r\nSUMMARY:Hiver\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(r.length, 2);
  assert.equal(heure(r[0].debut), "2026-10-22 10:30");
  assert.equal(heure(r[1].debut), "2026-12-01 09:30");
});
t("TZID Windows « Romance Standard Time » = heure de Bruxelles", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Romance Standard Time:20261022T113000\r\nDTEND;TZID=Romance Standard Time:20261022T123000\r\nSUMMARY:IMSV\r\nLOCATION:Auditoire 2\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(heure(r[0].debut), "2026-10-22 11:30"); assert.equal(heure(r[0].fin), "2026-10-22 12:30"); assert.equal(r[0].lieu, "Auditoire 2");
});
t("TZID IANA d'un autre fuseau (New York) converti", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=America/New_York:20261022T080000\r\nDTEND;TZID=America/New_York:20261022T090000\r\nSUMMARY:X\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(heure(r[0].debut), "2026-10-22 14:00");
});
t("lignes repliées, échappements et lien Teams dans la description", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261022T120000Z\r\nDTEND:20261022T130000Z\r\nSUMMARY:Réunion\\, FMPB\r\nDESCRIPTION:Rejoindre : https://teams.microsoft.com/l/meetup-join/abc\r\n  suite\\nautre https://exemple.be/x\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(r[0].titre, "Réunion, FMPB");
  assert.ok(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\/abc/.test(r[0].url), r[0].url);
});
t("événement sur la journée entière", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261104\r\nSUMMARY:Congé\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(r.length, 1); assert.ok(r[0].journee); assert.equal(r[0].jour, "2026-11-02"); assert.equal((r[0].fin - r[0].debut) / 86400000 | 0, 2);
});
t("récurrence hebdomadaire BYDAY, COUNT et heure d'hiver conservée", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Europe/Brussels:20261015T101000\r\nDTEND;TZID=Europe/Brussels:20261015T115000\r\nRRULE:FREQ=WEEKLY;BYDAY=TH,FR;COUNT=6\r\nSUMMARY:5TTy\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.deepEqual(r.map(function (x) { return heure(x.debut); }), ["2026-10-15 10:10", "2026-10-16 10:10", "2026-10-22 10:10", "2026-10-23 10:10", "2026-10-29 10:10", "2026-10-30 10:10"]);
  var h = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Europe/Brussels:20261022T101000\r\nDTEND;TZID=Europe/Brussels:20261022T115000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:x\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.deepEqual(h.map(function (x) { return heure(x.debut); }), ["2026-10-22 10:10", "2026-10-29 10:10", "2026-11-05 10:10"]);   // le 25/10, passage à l'heure d'hiver
});
t("EXDATE et RECURRENCE-ID (occurrence déplacée)", function () {
  var r = ics.lire(cal(
    "BEGIN:VEVENT\r\nUID:s\r\nDTSTART;TZID=Europe/Brussels:20261005T140000\r\nDTEND;TZID=Europe/Brussels:20261005T150000\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=Europe/Brussels:20261012T140000\r\nSUMMARY:Rém.\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nUID:s\r\nRECURRENCE-ID;TZID=Europe/Brussels:20261019T140000\r\nDTSTART;TZID=Europe/Brussels:20261020T160000\r\nDTEND;TZID=Europe/Brussels:20261020T170000\r\nSUMMARY:Rém. déplacée\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.deepEqual(r.map(function (x) { return heure(x.debut) + " " + x.titre; }), ["2026-10-05 14:00 Rém.", "2026-10-20 16:00 Rém. déplacée", "2026-10-26 14:00 Rém."]);
});
t("récurrence UNTIL, mensuelle (2e mardi) et quotidienne", function () {
  var u = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261001T080000Z\r\nDTEND:20261001T090000Z\r\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261007T235959Z\r\nSUMMARY:d\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(u.length, 4);
  var m = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Europe/Brussels:20261013T100000\r\nDTEND;TZID=Europe/Brussels:20261013T110000\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3\r\nSUMMARY:m\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.deepEqual(m.map(function (x) { return heure(x.debut); }), ["2026-10-13 10:00", "2026-11-10 10:00", "2026-12-08 10:00"]);
});
t("événement annulé ignoré, alarme ignorée, fenêtre respectée", function () {
  var r = ics.lire(cal("BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261022T080000Z\r\nDTEND:20261022T090000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:annulé\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART:20261023T080000Z\r\nDTEND:20261023T090000Z\r\nSUMMARY:b\r\nBEGIN:VALARM\r\nSUMMARY:alarme\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:c\r\nDTSTART:20300101T080000Z\r\nDTEND:20300101T090000Z\r\nSUMMARY:loin\r\nEND:VEVENT\r\n"), { de: DE, a: A });
  assert.equal(r.length, 1); assert.equal(r[0].titre, "b");
});
console.log(n + " tests réussis");
