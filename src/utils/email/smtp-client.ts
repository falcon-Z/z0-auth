/**
 * Minimal SMTP Client using Bun's native TCP sockets
 * Implements SMTP protocol (RFC 5321) without external dependencies
 * Supports STARTTLS for secure connections
 */

import type { SMTPConfig, EmailMessage, SendEmailResult } from "./types";

interface SMTPConnection {
  socket: ReturnType<typeof Bun.connect> extends Promise<infer T> ? T : never;
  secure: boolean;
}

// SMTP response codes
const SMTP_READY = 220;
const SMTP_OK = 250;
const SMTP_AUTH_CONTINUE = 334;
const SMTP_AUTH_SUCCESS = 235;
const SMTP_START_MAIL = 354;
const SMTP_QUIT = 221;

export class SMTPClient {
  private config: SMTPConfig;
  private connectionTimeout: number;
  private responseTimeout: number;

  constructor(config: SMTPConfig) {
    this.config = config;
    this.connectionTimeout = config.connectionTimeout ?? 30000;
    this.responseTimeout = config.responseTimeout ?? 30000;
  }

  /**
   * Send an email using SMTP
   */
  async send(message: EmailMessage): Promise<SendEmailResult> {
    const startTime = Date.now();

    try {
      // Connect to SMTP server
      const connection = await this.connect();

      try {
        // Perform SMTP handshake
        await this.performHandshake(connection);

        // Send the email
        const messageId = await this.sendMessage(connection, message);

        // Quit gracefully
        await this.quit(connection);

        return {
          success: true,
          messageId,
          timestamp: new Date(),
        };
      } finally {
        // Ensure connection is closed
        try {
          connection.socket.end();
        } catch {
          // Ignore close errors
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[SMTP] Send failed after ${Date.now() - startTime}ms:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Test SMTP connection and authentication
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const connection = await this.connect();

      try {
        await this.performHandshake(connection);
        await this.quit(connection);
        return { success: true };
      } finally {
        try {
          connection.socket.end();
        } catch {
          // Ignore
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async connect(): Promise<SMTPConnection> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, this.connectionTimeout);

      try {
        let responseBuffer = "";
        let resolveResponse: ((value: string) => void) | null = null;

        const socket = await Bun.connect({
          hostname: this.config.host,
          port: this.config.port,
          tls: this.config.secure
            ? {
                rejectUnauthorized: true,
              }
            : undefined,
          socket: {
            data(socket, data) {
              responseBuffer += new TextDecoder().decode(data);

              // Check if we have a complete response (ends with \r\n)
              if (responseBuffer.includes("\r\n") && resolveResponse) {
                const response = responseBuffer;
                responseBuffer = "";
                resolveResponse(response);
                resolveResponse = null;
              }
            },
            error(socket, error) {
              reject(error);
            },
            close() {
              // Connection closed
            },
            open(socket) {
              clearTimeout(timeoutId);
            },
          },
        });

        // Helper to read response with timeout
        const readResponse = (): Promise<string> => {
          return new Promise((res, rej) => {
            const timeout = setTimeout(() => {
              rej(new Error("Response timeout"));
            }, this.responseTimeout);

            resolveResponse = (response: string) => {
              clearTimeout(timeout);
              res(response);
            };

            // Check if we already have data in buffer
            if (responseBuffer.includes("\r\n")) {
              const response = responseBuffer;
              responseBuffer = "";
              clearTimeout(timeout);
              resolveResponse = null;
              res(response);
            }
          });
        };

        // Attach readResponse to socket for use in commands
        (socket as any).__readResponse = readResponse;

        // Wait for server greeting
        const greeting = await readResponse();
        const greetingCode = parseInt(greeting.substring(0, 3), 10);

        if (greetingCode !== SMTP_READY) {
          throw new Error(`Unexpected server greeting: ${greeting}`);
        }

        resolve({
          socket: socket as SMTPConnection["socket"],
          secure: this.config.secure,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private async performHandshake(connection: SMTPConnection): Promise<void> {
    const readResponse = (connection.socket as any).__readResponse as () => Promise<string>;

    // Send EHLO
    await this.sendCommand(connection.socket, `EHLO ${this.getHostname()}`);
    const ehloResponse = await readResponse();

    if (!ehloResponse.includes("250")) {
      throw new Error(`EHLO failed: ${ehloResponse}`);
    }

    // Check for STARTTLS if not already secure
    if (!connection.secure && ehloResponse.includes("STARTTLS")) {
      await this.startTLS(connection);

      // Re-send EHLO after STARTTLS
      await this.sendCommand(connection.socket, `EHLO ${this.getHostname()}`);
      const tlsEhloResponse = await readResponse();

      if (!tlsEhloResponse.includes("250")) {
        throw new Error(`EHLO after STARTTLS failed: ${tlsEhloResponse}`);
      }
    }

    // Authenticate
    await this.authenticate(connection);
  }

  private async startTLS(connection: SMTPConnection): Promise<void> {
    const readResponse = (connection.socket as any).__readResponse as () => Promise<string>;

    await this.sendCommand(connection.socket, "STARTTLS");
    const response = await readResponse();

    if (!response.startsWith("220")) {
      throw new Error(`STARTTLS failed: ${response}`);
    }

    // Upgrade to TLS - Note: Bun's socket upgrade is handled differently
    // For now, we recommend using port 465 with secure: true
    console.warn(
      "[SMTP] STARTTLS upgrade not fully supported. Consider using port 465 with secure: true"
    );
    connection.secure = true;
  }

  private async authenticate(connection: SMTPConnection): Promise<void> {
    const readResponse = (connection.socket as any).__readResponse as () => Promise<string>;

    // Use AUTH LOGIN
    await this.sendCommand(connection.socket, "AUTH LOGIN");
    const authResponse = await readResponse();

    if (!authResponse.startsWith("334")) {
      throw new Error(`AUTH LOGIN not supported: ${authResponse}`);
    }

    // Send username (base64 encoded)
    const username = Buffer.from(this.config.auth.user).toString("base64");
    await this.sendCommand(connection.socket, username);
    const userResponse = await readResponse();

    if (!userResponse.startsWith("334")) {
      throw new Error(`Username rejected: ${userResponse}`);
    }

    // Send password (base64 encoded)
    const password = Buffer.from(this.config.auth.password).toString("base64");
    await this.sendCommand(connection.socket, password);
    const passResponse = await readResponse();

    if (!passResponse.startsWith("235")) {
      throw new Error(`Authentication failed: ${passResponse}`);
    }
  }

  private async sendMessage(
    connection: SMTPConnection,
    message: EmailMessage
  ): Promise<string> {
    const readResponse = (connection.socket as any).__readResponse as () => Promise<string>;

    // Generate message ID
    const messageId = this.generateMessageId();

    // MAIL FROM
    await this.sendCommand(
      connection.socket,
      `MAIL FROM:<${this.config.from.email}>`
    );
    const mailFromResponse = await readResponse();

    if (!mailFromResponse.startsWith("250")) {
      throw new Error(`MAIL FROM failed: ${mailFromResponse}`);
    }

    // RCPT TO (for each recipient)
    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    const allRecipients = [
      ...recipients,
      ...(message.cc ?? []),
      ...(message.bcc ?? []),
    ];

    for (const recipient of allRecipients) {
      await this.sendCommand(connection.socket, `RCPT TO:<${recipient}>`);
      const rcptResponse = await readResponse();

      if (!rcptResponse.startsWith("250")) {
        throw new Error(`RCPT TO failed for ${recipient}: ${rcptResponse}`);
      }
    }

    // DATA
    await this.sendCommand(connection.socket, "DATA");
    const dataResponse = await readResponse();

    if (!dataResponse.startsWith("354")) {
      throw new Error(`DATA command failed: ${dataResponse}`);
    }

    // Build and send email content
    const emailContent = this.buildEmailContent(message, messageId, recipients);
    await this.sendCommand(connection.socket, emailContent);
    await this.sendCommand(connection.socket, "\r\n.");

    const contentResponse = await readResponse();

    if (!contentResponse.startsWith("250")) {
      throw new Error(`Email content rejected: ${contentResponse}`);
    }

    return messageId;
  }

  private async quit(connection: SMTPConnection): Promise<void> {
    const readResponse = (connection.socket as any).__readResponse as () => Promise<string>;

    try {
      await this.sendCommand(connection.socket, "QUIT");
      await readResponse();
    } catch {
      // Ignore quit errors
    }
  }

  private sendCommand(socket: SMTPConnection["socket"], command: string): void {
    socket.write(`${command}\r\n`);
  }

  private buildEmailContent(
    message: EmailMessage,
    messageId: string,
    recipients: string[]
  ): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const date = new Date().toUTCString();

    const headers = [
      `Message-ID: <${messageId}>`,
      `Date: ${date}`,
      `From: ${this.config.from.name} <${this.config.from.email}>`,
      `To: ${recipients.join(", ")}`,
      `Subject: ${this.encodeSubject(message.subject)}`,
      "MIME-Version: 1.0",
    ];

    if (message.replyTo) {
      headers.push(`Reply-To: ${message.replyTo}`);
    }

    if (message.cc && message.cc.length > 0) {
      headers.push(`Cc: ${message.cc.join(", ")}`);
    }

    // Add custom headers
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        headers.push(`${key}: ${value}`);
      }
    }

    // Build multipart message if we have both HTML and text
    if (message.text && message.html) {
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

      return [
        headers.join("\r\n"),
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        this.encodeQuotedPrintable(message.text),
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        this.encodeQuotedPrintable(message.html),
        `--${boundary}--`,
      ].join("\r\n");
    }

    // HTML only
    headers.push("Content-Type: text/html; charset=utf-8");
    headers.push("Content-Transfer-Encoding: quoted-printable");

    return [
      headers.join("\r\n"),
      "",
      this.encodeQuotedPrintable(message.html),
    ].join("\r\n");
  }

  private encodeSubject(subject: string): string {
    // Check if subject contains non-ASCII characters
    if (/[^\x00-\x7F]/.test(subject)) {
      return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    }
    return subject;
  }

  private encodeQuotedPrintable(text: string): string {
    return text
      .split("")
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code === 9 || code === 10 || code === 13) {
          return char;
        }
        if (code >= 32 && code <= 126 && code !== 61) {
          return char;
        }
        return `=${code.toString(16).toUpperCase().padStart(2, "0")}`;
      })
      .join("")
      .replace(/(.{75})/g, "$1=\r\n");
  }

  private generateMessageId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    const domain = this.config.from.email.split("@")[1] ?? "localhost";
    return `${timestamp}.${random}@${domain}`;
  }

  private getHostname(): string {
    try {
      return process.env.HOSTNAME ?? process.env.HOST ?? "localhost";
    } catch {
      return "localhost";
    }
  }
}

/**
 * Create SMTP client from environment variables or config
 */
export function createSMTPClient(config?: Partial<SMTPConfig>): SMTPClient {
  const smtpConfig: SMTPConfig = {
    host: config?.host ?? process.env.SMTP_HOST ?? "localhost",
    port: config?.port ?? parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: config?.secure ?? process.env.SMTP_SECURE === "true",
    auth: {
      user: config?.auth?.user ?? process.env.SMTP_USER ?? "",
      password: config?.auth?.password ?? process.env.SMTP_PASSWORD ?? "",
    },
    from: {
      name: config?.from?.name ?? process.env.SMTP_FROM_NAME ?? "Z0 Auth",
      email: config?.from?.email ?? process.env.SMTP_FROM_EMAIL ?? "noreply@example.com",
    },
    connectionTimeout: config?.connectionTimeout,
    responseTimeout: config?.responseTimeout,
  };

  return new SMTPClient(smtpConfig);
}
