// SMTP-Pruefung ueber Port 25. Es wird NIE eine echte E-Mail versendet:
// die Konversation endet nach RCPT TO (kein DATA). Ergebnisse werden ehrlich
// als accepted/rejected/blocked/timeout/greylisted/smtp_error dokumentiert.
//
// Wichtig: Port 25 ausgehend ist in vielen Netzen blockiert. Dann ist das
// Ergebnis korrekt "blocked"/"timeout" -> die Adresse gilt als UNBEKANNT,
// niemals automatisch als gueltig.

import net from "node:net";
import { randomBytes } from "node:crypto";
import type { SmtpCheck } from "./types";

const HELO_DOMAIN = process.env.EMAIL_VALIDATOR_HELO_DOMAIN || "mail.example.com";
const MAIL_FROM = process.env.EMAIL_VALIDATOR_MAIL_FROM || `verify@${HELO_DOMAIN}`;
const CONNECT_TIMEOUT = 8000;
const STEP_TIMEOUT = 8000;

export type SmtpProbe = {
  reachable: boolean | null;
  check: SmtpCheck;
  catch_all: boolean | null;
  mailbox_full: boolean | null;
  account_disabled: boolean | null;
  code: number | null;
  message: string;
};

function classifyRcptCode(code: number): SmtpCheck {
  if (code >= 200 && code < 260) return "accepted";
  if (code === 450 || code === 451 || code === 452) return "greylisted"; // temporaer
  if (code === 421) return "blocked";
  if (code >= 500 && code < 600) return "rejected";
  return "unknown";
}

type Session = {
  send: (line: string) => Promise<{ code: number; text: string }>;
  end: () => void;
};

function openSession(host: string): Promise<{ session: Session; banner: { code: number; text: string } }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: 25 });
    let buffer = "";
    let pending: ((value: { code: number; text: string }) => void) | null = null;
    let rejectPending: ((reason: Error) => void) | null = null;
    let stepTimer: NodeJS.Timeout | null = null;

    const fail = (error: Error) => {
      if (stepTimer) clearTimeout(stepTimer);
      socket.destroy();
      if (rejectPending) rejectPending(error);
      else reject(error);
    };

    socket.setTimeout(CONNECT_TIMEOUT, () => fail(new Error("timeout")));
    socket.on("error", (error) => fail(error));

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // Mehrzeilige SMTP-Antworten nutzen "250-" fuer Fortsetzung und "250 "
      // (Ziffern + Leerzeichen) fuer die letzte Zeile. Auf letzte Zeile warten.
      const lines = buffer.trimEnd().split(/\r?\n/);
      const last = lines[lines.length - 1] ?? "";
      const finalMatch = last.match(/^(\d{3}) /);
      if (finalMatch) {
        const code = Number(finalMatch[1]);
        const text = buffer.trim();
        buffer = "";
        if (stepTimer) clearTimeout(stepTimer);
        const resolver = pending;
        pending = null;
        rejectPending = null;
        resolver?.({ code, text });
      }
    });

    const waitFor = (): Promise<{ code: number; text: string }> => new Promise((res, rej) => {
      pending = res;
      rejectPending = rej;
      stepTimer = setTimeout(() => fail(new Error("timeout")), STEP_TIMEOUT);
    });

    const send = async (line: string) => {
      socket.write(`${line}\r\n`);
      return waitFor();
    };

    // Auf Banner (220) warten.
    pending = (banner) => {
      const session: Session = { send, end: () => { try { socket.write("QUIT\r\n"); } catch { /* ignore */ } socket.destroy(); } };
      resolve({ session, banner });
    };
    rejectPending = reject;
    stepTimer = setTimeout(() => fail(new Error("timeout")), CONNECT_TIMEOUT);
  });
}

export async function probeSmtp(mxHost: string, email: string, domain: string): Promise<SmtpProbe> {
  const base: SmtpProbe = {
    reachable: null, check: "unknown", catch_all: null,
    mailbox_full: null, account_disabled: null, code: null, message: "",
  };

  try {
    const { session, banner } = await openSession(mxHost);
    if (banner.code !== 220) {
      session.end();
      return { ...base, reachable: true, check: banner.code === 421 ? "blocked" : "smtp_error", code: banner.code, message: banner.text };
    }

    const ehlo = await session.send(`EHLO ${HELO_DOMAIN}`);
    if (ehlo.code >= 500) await session.send(`HELO ${HELO_DOMAIN}`);
    await session.send(`MAIL FROM:<${MAIL_FROM}>`);

    const rcpt = await session.send(`RCPT TO:<${email}>`);
    const check = classifyRcptCode(rcpt.code);
    const mailbox_full = rcpt.code === 452 || /quota|full|mailbox.*exceeded/i.test(rcpt.text) ? true : null;
    const account_disabled = /disabled|inactive|suspended|no longer/i.test(rcpt.text) ? true : null;

    // Catch-all: zufaellige Adresse testen. Nur wenn RCPT ueberhaupt beantwortet wurde.
    let catch_all: boolean | null = null;
    if (check === "accepted" || check === "rejected") {
      const random = `no-such-user-${randomBytes(6).toString("hex")}@${domain}`;
      try {
        const probe = await session.send(`RCPT TO:<${random}>`);
        catch_all = classifyRcptCode(probe.code) === "accepted";
      } catch {
        catch_all = null;
      }
    }

    session.end();
    return {
      reachable: true, check, catch_all, mailbox_full, account_disabled,
      code: rcpt.code, message: rcpt.text.slice(0, 300),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Timeout vs. Verbindungsfehler unterscheiden.
    if (/timeout/i.test(message)) return { ...base, reachable: null, check: "timeout", message };
    if (/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EACCES/i.test(message)) {
      return { ...base, reachable: false, check: "blocked", message };
    }
    return { ...base, reachable: null, check: "smtp_error", message };
  }
}
