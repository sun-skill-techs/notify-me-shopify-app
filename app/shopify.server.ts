import "@shopify/shopify-app-react-router/adapters/node";
import crypto from "node:crypto";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

// authenticate.webhook refreshes the shop's offline token first if it has expired
// (they last an hour). After an uninstall Shopify rejects that refresh, so the
// webhook 500s on every retry and the session is never removed. Webhooks that
// don't call the Admin API only need the HMAC check.
export async function verifyWebhook(request: Request) {
  const rawBody = await request.text();
  const given = Buffer.from(request.headers.get("X-Shopify-Hmac-Sha256") ?? "", "base64");
  const expected = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
    .update(rawBody)
    .digest();
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }
  return {
    shop: request.headers.get("X-Shopify-Shop-Domain") ?? "",
    topic: request.headers.get("X-Shopify-Topic") ?? "",
    payload: JSON.parse(rawBody) as unknown,
  };
}
