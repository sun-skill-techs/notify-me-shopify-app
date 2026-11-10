import { METAFIELD, sanitize, toStyle, type WidgetSettings } from "./widget";

type Admin = {
  graphql: (q: string, o?: { variables: Record<string, unknown> }) => Promise<Response>;
};

const INSTALLATION_QUERY = `#graphql
  query notifyMeWidget($namespace: String!, $key: String!) {
    currentAppInstallation {
      id
      metafield(namespace: $namespace, key: $key) { jsonValue }
    }
  }`;

export async function readWidget(admin: Admin) {
  const res = await admin.graphql(INSTALLATION_QUERY, { variables: METAFIELD });
  const { data } = await res.json();
  const installation = data?.currentAppInstallation;
  return {
    ownerId: installation?.id as string | undefined,
    saved: Boolean(installation?.metafield),
    settings: sanitize(installation?.metafield?.jsonValue),
  };
}

/** Returns an error message, or null once saved. */
export async function saveWidget(admin: Admin, ownerId: string, settings: WidgetSettings) {
  // The block reads this in Liquid; `style` is precomputed so the theme
  // doesn't have to rebuild CSS from individual values.
  const save = await admin.graphql(
    `#graphql
      mutation notifyMeSaveWidget($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { message } }
      }`,
    {
      variables: {
        metafields: [
          {
            ...METAFIELD,
            ownerId,
            type: "json",
            value: JSON.stringify({ ...settings, style: toStyle(settings) }),
          },
        ],
      },
    },
  );
  const result = await save.json();
  return (result.data?.metafieldsSet?.userErrors?.[0]?.message as string | undefined) ?? null;
}

/** Custom CSS is a Starter feature: drop it from the storefront when a store moves to Free. */
export async function dropCustomCss(admin: Admin) {
  const { ownerId, settings } = await readWidget(admin);
  if (!ownerId || !settings.customCss) return;
  const error = await saveWidget(admin, ownerId, { ...settings, customCss: "" });
  if (error) console.error("notify-me: could not remove custom CSS", error);
}
