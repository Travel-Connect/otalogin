import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
  process.exit(1);
}

// localhostで受け取る（OOBは使わない）
const PORT = 42813;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url ?? "", `http://localhost:${PORT}`);
    if (reqUrl.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const code = reqUrl.searchParams.get("code");
    const err = reqUrl.searchParams.get("error");
    if (err) {
      res.writeHead(400);
      res.end(`Error: ${err}`);
      console.error("OAuth error:", err);
      server.close();
      return;
    }

    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      server.close();
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("OK! You can close this tab and go back to your terminal.\n");

    console.log("\n=== TOKENS ===");
    // ※ここに refresh_token が出るので、スクショ/共有しない
    console.log(tokens);
    console.log("\nGOOGLE_REFRESH_TOKEN =", tokens.refresh_token);

    server.close();
  } catch (e) {
    res.writeHead(500);
    res.end("Internal Server Error");
    console.error(e);
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  console.log(`\nWaiting for callback on ${REDIRECT_URI}\n`);
});
