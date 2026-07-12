import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { connect as netConnect, type Socket } from "node:net";

export type SmtpSendOptions = {
  host: string;
  port: number;
  encryption: "none" | "starttls" | "tls";
  username?: string | null;
  password?: string | null;
  fromAddress: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
};

type SmtpResult = { ok: true } | { ok: false; message: string };

function formatAddress(address: string, name?: string | null): string {
  const safeName = name?.replace(/[\r\n]+/g, " ").trim();
  if (safeName) return `"${safeName.replace(/"/g, '\\"')}" <${address}>`;
  return address;
}

function encodeSubject(subject: string): string {
  return subject.replace(/\r?\n/g, " ");
}

/** RFC 5321: lines starting with "." in DATA must be dot-stuffed. */
function dotStuffSmtpBody(text: string): string {
  const normalized = text.replace(/\r?\n/g, "\r\n");
  return normalized
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

class SmtpSession {
  private socket: Socket | TLSSocket;
  private buffer = "";

  constructor(socket: Socket | TLSSocket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.setTimeout(10_000, () => socket.destroy(new Error("SMTP operation timed out")));
  }

  private async readResponse(): Promise<{ code: number; lines: string[] }> {
    return new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/).filter((l) => l.length > 0);
        if (lines.length === 0) return;

        const last = lines[lines.length - 1]!;
        if (/^\d{3} /.test(last)) {
          this.socket.off("data", onData);
          this.socket.off("error", onError);
          const code = Number.parseInt(last.slice(0, 3), 10);
          this.buffer = "";
          resolve({ code, lines });
        }
      };

      const onError = (err: Error) => {
        this.socket.off("data", onData);
        reject(err);
      };

      this.socket.on("data", onData);
      this.socket.on("error", onError);
    });
  }

  private async command(cmd: string, expect = [250, 251, 235, 334, 354]): Promise<SmtpResult> {
    this.socket.write(`${cmd}\r\n`);
    const { code, lines } = await this.readResponse();
    if (!expect.includes(code)) {
      return { ok: false, message: lines.join(" ") || `SMTP error ${code}` };
    }
    return { ok: true };
  }

  async run(options: SmtpSendOptions): Promise<SmtpResult> {
    const greet = await this.readResponse();
    if (greet.code !== 220) return { ok: false, message: greet.lines.join(" ") };

    let ehlo = await this.command(`EHLO ${options.host}`, [250]);
    if (!ehlo.ok) {
      ehlo = await this.command("HELO localhost", [250]);
      if (!ehlo.ok) return ehlo;
    }

    if (options.encryption === "starttls") {
      const start = await this.command("STARTTLS", [220]);
      if (!start.ok) return start;

      await new Promise<void>((resolve, reject) => {
        const tlsSocket = tlsConnect(
          { socket: this.socket as Socket, servername: options.host },
          () => resolve(),
        );
        tlsSocket.once("error", reject);
        this.socket = tlsSocket;
        this.socket.setEncoding("utf8");
        this.socket.setTimeout(10_000, () => this.socket.destroy(new Error("SMTP operation timed out")));
      });

      ehlo = await this.command(`EHLO ${options.host}`, [250]);
      if (!ehlo.ok) return ehlo;
    }

    if (options.username && options.password) {
      const auth = await this.command("AUTH LOGIN", [334]);
      if (!auth.ok) return auth;
      const user = await this.command(Buffer.from(options.username, "utf8").toString("base64"), [334]);
      if (!user.ok) return user;
      const pass = await this.command(Buffer.from(options.password, "utf8").toString("base64"), [235]);
      if (!pass.ok) return pass;
    }

    const from = await this.command(`MAIL FROM:<${options.fromAddress}>`, [250]);
    if (!from.ok) return from;

    const to = await this.command(`RCPT TO:<${options.to}>`, [250, 251]);
    if (!to.ok) return to;

    const dataReady = await this.command("DATA", [354]);
    if (!dataReady.ok) return dataReady;

    const body = [
      `From: ${formatAddress(options.fromAddress, options.fromName)}`,
      `To: ${options.to}`,
      `Subject: ${encodeSubject(options.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      dotStuffSmtpBody(options.text),
    ].join("\r\n");

    this.socket.write(`${body}\r\n.\r\n`);
    const sent = await this.readResponse();
    if (sent.code !== 250) return { ok: false, message: sent.lines.join(" ") };

    await this.command("QUIT", [221]);
    return { ok: true };
  }

  close() {
    try {
      this.socket.end();
    } catch {
      /* ignore */
    }
  }
}

function connectSocket(host: string, port: number, encryption: SmtpSendOptions["encryption"]): Promise<Socket | TLSSocket> {
  return new Promise((resolve, reject) => {
    if (encryption === "tls") {
      const socket = tlsConnect({ host, port, servername: host }, () => resolve(socket));
      socket.once("error", reject);
      return;
    }

    const socket = netConnect({ host, port }, () => resolve(socket));
    socket.once("error", reject);
  });
}

export async function sendSmtpMessage(options: SmtpSendOptions): Promise<SmtpResult> {
  if (options.encryption === "none" && process.env.NODE_ENV === "production") {
    return { ok: false, message: "Unencrypted SMTP is not allowed in production." };
  }

  let session: SmtpSession | null = null;
  try {
    const socket = await connectSocket(options.host, options.port, options.encryption);
    session = new SmtpSession(socket);
    return await session.run(options);
  } catch (e) {
    const message = e instanceof Error ? e.message : "SMTP connection failed";
    return { ok: false, message };
  } finally {
    session?.close();
  }
}
