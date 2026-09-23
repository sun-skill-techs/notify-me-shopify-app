import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";

// The library sends shop-less, non-embedded requests here. App Store apps
// mustn't ask for a shop domain, so there's no form: a known shop continues to
// OAuth (login() throws that redirect), anything else goes to the public page.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (new URL(request.url).searchParams.get("shop")) await login(request);
  throw redirect("/");
};
