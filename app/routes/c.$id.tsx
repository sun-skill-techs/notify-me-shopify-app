import type { LoaderFunctionArgs } from "react-router";
import crypto from "node:crypto";
import db from "../db.server";
import { clickToken } from "../notify.server";

// GET /c/:id?u=<product url>&t=<signature>: the Shop now link in restock emails.
// Records the first click (Grow analytics), then sends the shopper on.
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const target = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const expected = clickToken(params.id ?? "", target);
  // Only links the app signed redirect, so this can't send anyone to an arbitrary site.
  if (
    !/^https:\/\//.test(target) ||
    token.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  ) {
    return new Response("Link not found", { status: 404 });
  }

  await db.restockSubscription
    .updateMany({ where: { id: params.id, clickedAt: null }, data: { clickedAt: new Date() } })
    .catch((e) => console.error("notify-me: click not recorded", e));

  return Response.redirect(target, 302);
};
